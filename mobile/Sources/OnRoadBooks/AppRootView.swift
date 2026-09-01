import SwiftUI

/// Login gate, and the owner of the two things that outlive any one screen:
/// whether there is signal, and the writes that are still waiting for some.
///
/// Real auth calls `/api/mobile/login`; "Ver con datos de muestra" bypasses it
/// entirely for anyone without a live OnRoad Books account. Demo mode gets no
/// queue — there is nothing to send.
struct AppRootView: View {
    @StateObject private var authSession = AuthSession()
    @StateObject private var monitor = NetworkMonitor()
    @StateObject private var appLock = AppLock()
    @StateObject private var queue = WriteQueue(
        client: APIClient(baseURL: APIConfig.baseURL, tokenProvider: { AuthSession.storedToken() })
    )
    @State private var useDemo = false
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            Group {
                if authSession.isAuthenticated {
                    RootTabView(
                        repository: APIRepository(
                            tokenProvider: { authSession.token },
                            queue: queue,
                            isOnline: { [flag = monitor.flag] in flag.current }
                        ),
                        accountLabel: authSession.email ?? "Signed in",
                        greetingName: authSession.firstName,
                        queue: queue,
                        monitor: monitor,
                        appLock: appLock,
                        onSignOut: { authSession.logout() }
                    )
                } else if useDemo {
                    RootTabView(
                        repository: MockRepository(),
                        accountLabel: "Datos de muestra",
                        appLock: appLock,
                        onSignOut: { useDemo = false }
                    )
                } else {
                    LoginView(authSession: authSession, onUseDemo: { useDemo = true })
                }
            }

            // Covers a real session or demo mode -- never the login screen,
            // which has nothing yet worth locking behind a second gate.
            if (authSession.isAuthenticated || useDemo), appLock.isEnabled, !appLock.isUnlocked {
                AppLockView(lock: appLock, onSignOut: {
                    if authSession.isAuthenticated {
                        authSession.logout()
                    } else {
                        useDemo = false
                    }
                })
                .transition(.opacity)
            }
        }
        .preferredColorScheme(.dark)
        .onReceive(NotificationCenter.default.publisher(for: .obNetworkPathChanged)) { note in
            guard let online = note.object as? Bool else { return }
            monitor.apply(online: online)
            if online { Task { await queue.flush() } }
        }
        .onChange(of: scenePhase) { phase in
            // Lock on the way OUT of the foreground, not on the way back in --
            // that way there is never a frame where a backgrounded app shows
            // real numbers in the app switcher.
            if phase == .background { appLock.lockOnBackground() }
        }
    }
}
