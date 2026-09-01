import Foundation

/// The single seam between the UI and wherever the ledger actually lives —
/// mirrors the web app's `Repository` interface
/// (`src/lib/db/repository.ts`): views never know or care whether they're
/// reading `MockRepository` or a real `APIRepository`.
protocol LedgerRepository {
    func fetchDashboard() async throws -> DashboardSnapshot
    func fetchLoads() async throws -> [Load]
    func fetchExpenses() async throws -> [ExpenseEntry]
    func fetchSettlements() async throws -> [SettlementPeriod]
}
