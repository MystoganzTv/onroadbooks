import Foundation

@MainActor
final class DashboardViewModel: ObservableObject {
    @Published var snapshot: DashboardSnapshot?
    @Published var isLoading = true

    private let repository: LedgerRepository
    init(repository: LedgerRepository) { self.repository = repository }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        snapshot = try? await repository.fetchDashboard()
    }
}
