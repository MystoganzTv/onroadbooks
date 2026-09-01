import SwiftUI

/// Login gate. Real auth calls the `/api/mobile/login` route added to the
/// web app; "Ver con datos de muestra" bypasses it entirely for design
/// review before that route is deployed (or for anyone without a live
/// OnRoad Books account).
struct AppRootView: View {
    @StateObject private var authSession = AuthSession()
    @State private var useDemo = false

    var body: some View {
        Group {
            if authSession.isAuthenticated {
                RootTabView(
                    repository: APIRepository(tokenProvider: { authSession.token }),
                    accountLabel: authSession.email ?? "Signed in",
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
    }
}
