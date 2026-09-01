import SwiftUI

/// Bottom tab bar. The web app has ~20 destinations grouped under
/// Operate / Money / Intelligence / System (`nav-items.ts`); on a phone
/// that collapses to the four the cockpit positioning calls the most
/// important daily questions (Dashboard, Loads, Expenses, Settlements),
/// plus More for everything else.
struct RootTabView: View {
    let repository: LedgerRepository
    let accountLabel: String
    /// Shown on the dashboard. Nil in demo mode and on accounts with no name.
    let greetingName: String?
    /// Both absent in demo mode, which has nothing to send and nowhere to send
    /// it. Held as plain optionals rather than as @ObservedObject so demo mode
    /// never builds a queue or starts a path monitor it will not use; the views
    /// that observe them are children, and they take them non-optional.
    let queue: WriteQueue?
    let monitor: NetworkMonitor?
    /// nil only if neither a real session nor demo mode is active (shouldn't
    /// happen — AppRootView always passes one).
    var onSignOut: (() -> Void)?

    @State private var showingPending = false
    @Environment(\.scenePhase) private var scenePhase

    init(
        repository: LedgerRepository,
        accountLabel: String,
        greetingName: String? = nil,
        queue: WriteQueue? = nil,
        monitor: NetworkMonitor? = nil,
        onSignOut: (() -> Void)? = nil
    ) {
        self.repository = repository
        self.accountLabel = accountLabel
        self.greetingName = greetingName
        self.queue = queue
        self.monitor = monitor
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
            DashboardView(repository: repository, greetingName: greetingName)
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
        .safeAreaInset(edge: .top, spacing: 0) {
            if let queue, let monitor {
                PendingBanner(queue: queue, monitor: monitor) { showingPending = true }
            }
        }
        .sheet(isPresented: $showingPending) {
            if let queue, let monitor {
                NavigationStack {
                    PendingWritesView(queue: queue, monitor: monitor)
                        .toolbar {
                            ToolbarItem(placement: .cancellationAction) {
                                Button("Listo") { showingPending = false }
                            }
                        }
                }
                .preferredColorScheme(.dark)
            }
        }
        .onChange(of: scenePhase) { phase in
            // Coming back from a pocket is the most common moment for signal to
            // have returned without the path monitor having fired while the app
            // was suspended.
            if phase == .active, let queue { Task { await queue.flush() } }
        }
    }
}
