import Foundation

@MainActor
final class DashboardViewModel: ObservableObject {
    @Published var snapshot: DashboardSnapshot?
    @Published var isLoading = true
    /// Why the last refresh failed while an older snapshot is still showing.
    @Published var refreshFailure: String?

    private let fetchSnapshot: () async throws -> DashboardSnapshot
    private var latestRequest = UUID()
    convenience init(repository: LedgerRepository) {
        self.init(fetchSnapshot: { try await repository.fetchDashboard() })
    }

    init(fetchSnapshot: @escaping () async throws -> DashboardSnapshot) {
        self.fetchSnapshot = fetchSnapshot
    }

    /// A refresh never empties the cockpit. It used to assign `try?` straight
    /// into `snapshot`, so a pull-to-refresh that SwiftUI cancelled mid-flight
    /// replaced every figure and every recent load with "could not load".
    func load() async {
        let request = UUID()
        latestRequest = request
        if snapshot == nil { isLoading = true }
        defer { if latestRequest == request { isLoading = false } }
        do {
            let updated = try await fetchSnapshot()
            guard latestRequest == request else { return }
            snapshot = updated
            refreshFailure = nil
        } catch let error where error.isCancellation {
            // Abandoned by the app, not refused by anyone. Keep everything.
        } catch {
            guard latestRequest == request else { return }
            refreshFailure = (error as? LocalizedError)?.errorDescription
                ?? "No se pudo actualizar. Revisa la señal y desliza para reintentar."
        }
    }
}
