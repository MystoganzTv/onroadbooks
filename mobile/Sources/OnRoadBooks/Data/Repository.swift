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
    func fetchAnalytics() async throws -> AnalyticsSnapshot
    func fetchCalculatorDefaults() async throws -> CalculatorDefaults
    func fetchIfta(quarter: String?) async throws -> IftaReport
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
    @discardableResult func recordInvoicePayment(loadId: String, amount: Double, on date: Date) async throws -> String

    /// Correcting what is already in the books.
    ///
    /// The app was append-only until now: a mistyped rate could be added from
    /// the cab but only fixed at a laptop, while it moved the load's score,
    /// the cost per mile and Safe to Pay in the meantime.
    ///
    /// These are never queued. An edit and a delete are deliberate acts on a
    /// record that already exists, and replaying one later, unwatched, against
    /// a row someone may have changed since is the wrong default — the same
    /// reasoning that keeps team and settings writes out of the queue.
    func fetchLoadDetail(id: String) async throws -> LoadDetail
    @discardableResult func updateLoad(id: String, _ change: LoadEdit) async throws -> String
    func deleteLoad(id: String) async throws
    /// Deleting a load never deletes the money: its expenses and fuel are
    /// unlinked, not removed. The confirmation says so.
    func deleteExpense(id: String) async throws
    func deleteFuelStop(id: String) async throws

    /// Close or reopen a half-month.
    ///
    /// Closing freezes a snapshot built on the SERVER from the rows as they
    /// stand, and posts the reserve contributions that snapshot implies —
    /// nothing the phone sends is trusted as the figures. Reopening reverses
    /// exactly what the close wrote and nothing else.
    ///
    /// Never queued: this is the most consequential write in the product and
    /// replaying it later, unwatched, against rows that have since changed is
    /// not something to do on the owner's behalf.
    @discardableResult func setSettlementStatus(month: String, half: String, closed: Bool) async throws -> String

    /// Files a photo against a record that already exists. Never queued: a
    /// receipt has nothing to attach itself to until the expense has an id from
    /// the ledger, so this needs signal by definition.
    @discardableResult func attachReceipt(expenseId: String, jpeg: Data) async throws -> String

    /// Access & Roles: who has an app sign-in and what they can do with it.
    /// A Fleet-plan capability on the web (`hasFleetAccess`), so it throws
    /// `APIError.refused` on a Solo/Pro business exactly like Reserves does.
    func fetchTeam() async throws -> TeamRoster
    /// Never queued, unlike a load or a fill-up: an invite sends an email and
    /// a removal revokes a sign-in immediately, and doing either later without
    /// the owner watching is the wrong default. It fails now instead.
    @discardableResult func inviteTeamMember(email: String, name: String?, role: AssignableRole) async throws -> String
    @discardableResult func updateTeamMemberRole(userId: String, role: AssignableRole) async throws -> String
    func removeTeamMember(userId: String) async throws

    /// The truck-level IFTA filing decision (`Truck.iftaReportingEnabled` on
    /// the web) -- Included / Excluded / no decision yet. Same full-replace
    /// `truckSchema` write the web's Truck form and fleet dialog make; see
    /// `PATCH /api/mobile/truck`. Never queued, like a team change: it is a
    /// deliberate settings decision, not a record from the road, and holding
    /// it silently offline would leave the IFTA report looking wrong for no
    /// reason the owner could see.
    @discardableResult func updateTruckIftaFilingScope(truckId: String, iftaReportingEnabled: Bool?) async throws -> String
}
