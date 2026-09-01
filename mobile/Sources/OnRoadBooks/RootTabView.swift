import SwiftUI

/// Bottom tab bar. The web app has ~20 destinations grouped under
/// Operate / Money / Intelligence / System (`nav-items.ts`); on a phone
/// that collapses to the four the cockpit positioning calls the most
/// important daily questions (Dashboard, Loads, Expenses, Settlements),
/// plus More for everything else.
struct RootTabView: View {
    let repository: LedgerRepository
    let accountLabel: String
    /// nil only if neither a real session nor demo mode is active (shouldn't
    /// happen — AppRootView always passes one).
    var onSignOut: (() -> Void)?

    init(repository: LedgerRepository, accountLabel: String, onSignOut: (() -> Void)? = nil) {
        self.repository = repository
        self.accountLabel = accountLabel
        self.onSignOut = onSignOut

        let appearance = UITabBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = UIColor(OBColor.sidebar)
        UITabBar.appearance().standardAppearance = appearance
        UITabBar.appearance().scrollEdgeAppearance = appearance

        let navAppearance = UINavigationBarAppearance()
        navAppearance.configureWithOpaqueBackground()
        navAppearance.backgroundColor = UIColor(OBColor.background)
        navAppearance.titleTextAttributes = [.foregroundColor: UIColor(OBColor.foreground)]
        navAppearance.largeTitleTextAttributes = [.foregroundColor: UIColor(OBColor.foreground)]
        UINavigationBar.appearance().standardAppearance = navAppearance
        UINavigationBar.appearance().scrollEdgeAppearance = navAppearance
    }

    var body: some View {
        TabView {
            DashboardView(repository: repository)
                .tabItem { Label("Dashboard", systemImage: "gauge.with.dots.needle.67percent") }

            LoadsView(repository: repository)
                .tabItem { Label("Loads", systemImage: "shippingbox.fill") }

            ExpensesView(repository: repository)
                .tabItem { Label("Expenses", systemImage: "creditcard.fill") }

            SettlementsView(repository: repository)
                .tabItem { Label("Settlements", systemImage: "wallet.pass.fill") }

            MoreView(repository: repository, accountLabel: accountLabel, onSignOut: onSignOut)
                .tabItem { Label("More", systemImage: "ellipsis.circle.fill") }
        }
        .tint(OBColor.primary)
        .preferredColorScheme(.dark)
    }
}
