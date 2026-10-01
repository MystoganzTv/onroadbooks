import Foundation

@MainActor
final class DashboardViewModel: ObservableObject {
    @Published var snapshot: DashboardSnapshot?
    @Published var isLoading = true
    /// Why the last refresh failed while an older snapshot is still showing.
    @Published var refreshFailure: String?

    private let repository: LedgerRepository
    init(repository: LedgerRepository) { self.repository = repository }

    /// A refresh never empties the cockpit. It used to assign `try?` straight
    /// into `snapshot`, so a pull-to-refresh that SwiftUI cancelled mid-flight
    /// replaced every figure and every recent load with "could not load".
    func load() async {
        if snapshot == nil { isLoading = true }
        defer { isLoading = false }
        do {
            snapshot = try await repository.fetchDashboard()
            refreshFailure = nil
        } catch let error where error.isCancellation {
            // Abandoned by the app, not refused by anyone. Keep everything.
        } catch {
            refreshFailure = (error as? LocalizedError)?.errorDescription
                ?? "No se pudo actualizar. Revisa la señal y desliza para reintentar."
        }
    }
}
