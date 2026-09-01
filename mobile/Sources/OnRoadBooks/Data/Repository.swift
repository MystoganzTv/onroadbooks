import Foundation

/// The single seam between the UI and wherever the ledger actually lives —
/// mirrors the web app's `Repository` interface
/// (`src/lib/db/repository.ts`): views never know or care whether they're
/// reading `MockRepository` or a real `APIRepository`.
protocol LedgerRepository {
    func fetchDashboard() async throws -> DashboardSnapshot
    func fetchLoads() async throws -> [Load]
    func fetchExpenses() async throws -> ExpenseLedger
    func fetchSettlements() async throws -> [SettlementPeriod]
    func fetchFuel() async throws -> FuelLedger
    func fetchInvoices() async throws -> InvoiceLedger
    func fetchReserves() async throws -> ReserveLedger
    func fetchTruck() async throws -> TruckSummary
    func fetchReports() async throws -> [ReportSummary]
    func fetchReportTable(_ reportId: String) async throws -> ReportTable
    /// Renders the report as a file and returns a local URL to hand to the
    /// share sheet. A report on a phone is usually not read — it is sent.
    func downloadReport(_ reportId: String, format: String) async throws -> URL
    /// The whole year in one workbook, for the accountant.
    func downloadYearEndPacket(year: Int) async throws -> URL

    /// Both return the new record's id. They throw `APIError.refused` carrying
    /// the server's own sentence when the ledger says no -- an expired trial, a
    /// role without permission, a rate the numbers do not support. That text is
    /// written for the owner, so show it rather than replacing it.
    @discardableResult func createLoad(_ load: NewLoad) async throws -> String
    @discardableResult func createExpense(_ expense: NewExpense) async throws -> String
    @discardableResult func createFuelStop(_ stop: NewFuelStop) async throws -> String
    @discardableResult func issueInvoice(loadId: String, _ invoice: NewInvoice) async throws -> String
    @discardableResult func markInvoicePaid(loadId: String, on date: Date) async throws -> String

    /// Files a photo against a record that already exists. Never queued: a
    /// receipt has nothing to attach itself to until the expense has an id from
    /// the ledger, so this needs signal by definition.
    @discardableResult func attachReceipt(expenseId: String, jpeg: Data) async throws -> String
}
