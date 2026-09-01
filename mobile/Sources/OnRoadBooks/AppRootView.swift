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
    @StateObject private var queue = WriteQueue(
        client: APIClient(baseURL: APIConfig.baseURL, tokenProvider: { AuthSession.storedToken() })
    )
    @State private var useDemo = false

    var body: some View {
        Group {
            if authSession.isAuthenticated {
                RootTabView(
                    repository: APIRepository(
                        tokenProvider: { authSession.token },
                        queue: queue,
                        isOnline: { [flag = monitor.flag] in flag.current }
                    ),
                    accountLabel: authSession.email ?? "Signed in",
                    queue: queue,
                    monitor: monitor,
                    onSignOut: { authSession.logout() }
                )
            } else if useDemo {
                RootTabView(
                    repository: MockRepository(),
                    accountLabel: "Datos de muestra",
                    onSignOut: { useDemo = false }
                )
            } else {
                LoginView(authSession: authSession, onUseDemo: { useDemo = true })
            }
        }
        .preferredColorScheme(.dark)
        .onReceive(NotificationCenter.default.publisher(for: .obNetworkPathChanged)) { note in
            guard let online = note.object as? Bool else { return }
            monitor.apply(online: online)
            if online { Task { await queue.flush() } }
        }
    }
}
