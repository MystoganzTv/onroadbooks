import Foundation

/// The single seam between the UI and wherever the ledger actually lives —
/// mirrors the web app's `Repository` interface
/// (`src/lib/db/repository.ts`): views never know or care whether they're
/// reading `MockRepository` or a real `APIRepository`.
protocol LedgerRepository {
    func syncApplePurchase(_ signedTransaction: String) async throws -> ApplePurchaseResult
    func changeAccountData(intent: String, confirmation: String) async throws
    func fetchCostPerMile() async throws -> CostPerMileSnapshot
    func scanRateCon(data: Data, contentType: String) async throws -> [String: String]
    func fetchAccount() async throws -> AccountSummary
    func fetchDocuments() async throws -> DocumentLibrary
    func downloadDocument(_ id: String) async throws -> URL
    func deleteStoredDocument(_ id: String) async throws
    func uploadDocument(owner: String, entityId: String, type: String, name: String, contentType: String, data: Data) async throws

    func downloadInvoice(loadId: String) async throws -> URL
    func fetchManagement(_ resource: String, quarter: String?) async throws -> ManagementCollection
    func saveManagement(_ resource: String, id: String?, values: [String: String]) async throws
    func deleteManagement(_ resource: String, id: String) async throws

    func fetchDashboard() async throws -> DashboardSnapshot
    func fetchLoads() async throws -> [Load]
    func fetchExpenses() async throws -> ExpenseLedger
    func fetchFuel() async throws -> FuelLedger
    func fetchInvoices() async throws -> InvoiceLedger
    func fetchReserves() async throws -> ReserveLedger
    func fetchTruck() async throws -> TruckSummary
    /// `grouping` mirrors the toggle on the web's lanes page. The route used
    /// to take the function default, "state", while that page defaults to
    /// "market" — same screen, different unit of analysis, unlabelled.
    func fetchAnalytics(grouping: LaneGrouping) async throws -> AnalyticsSnapshot
    func fetchCalculatorDefaults() async throws -> CalculatorDefaults
    func fetchIfta(quarter: String?) async throws -> IftaReport
    func fetchReports() async throws -> [ReportSummary]
    /// Scoped, like every other read, by whatever the period bar is set to —
    /// see `Scope`. The report routes have always parsed `?month=&period=`.
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
    /// Brokers, contacts and fee rates for the load form. Optional: a screen
    /// that cannot get them still works, it just asks for more typing.
    func fetchLoadFormOptions() async throws -> LoadFormOptions
    @discardableResult func updateLoad(id: String, _ change: LoadEdit) async throws -> String
    func deleteLoad(id: String) async throws
    /// Deleting a load never deletes the money: its expenses and fuel are
    /// unlinked, not removed. The confirmation says so.
    func deleteExpense(id: String) async throws
    func deleteFuelStop(id: String) async throws

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

    /// Correcting an expense or a fill-up. Same merge-on-the-server contract
    /// as a load: the phone sends what it shows, the rest is preserved.
    func fetchExpenseDetail(id: String) async throws -> ExpenseDetail
    @discardableResult func updateExpense(id: String, _ change: NewExpense) async throws -> String
    /// A reviewed loan payment is always fetched, changed and deleted as one
    /// transaction. No mobile method exposes either accounting row alone.
    func fetchDebtPaymentDetail(id: String) async throws -> DebtPaymentDetail
    @discardableResult func updateDebtPayment(id: String, _ change: DebtPaymentEdit) async throws -> String
    func deleteDebtPayment(id: String) async throws
    func fetchFuelDetail(id: String) async throws -> FuelDetail
    @discardableResult func updateFuelStop(id: String, _ change: NewFuelStop) async throws -> String

    /// Money into or out of a reserve bucket, by hand. Owner-only and
    /// cockpit-gated, exactly as on the web.
    @discardableResult func recordReserveMovement(_ movement: ReserveMovementInput) async throws -> String

    /// One driver statement with its loads and adjustments.
    func fetchDriverStatement(id: String) async throws -> DriverStatementDetail

    /// Fleet, on the phone. All three ride the same `hasFleetAccess` gate the
    /// web does, so on a Solo or Pro business they throw `APIError.refused`
    /// with the server's own sentence — a lock with a reason, not an error.
    func fetchDrivers() async throws -> [DriverRecord]
    @discardableResult func createDriver(_ driver: NewDriver) async throws -> String
    @discardableResult func setDriverActive(id: String, active: Bool) async throws -> String
    func fetchFleet() async throws -> FleetOverview
    func fetchDriverStatements() async throws -> [DriverStatement]

    /// The truck-level IFTA filing decision (`Truck.iftaReportingEnabled` on
    /// the web) -- Included / Excluded / no decision yet. Same full-replace
    /// `truckSchema` write the web's Truck form and fleet dialog make; see
    /// `PATCH /api/mobile/truck`. Never queued, like a team change: it is a
    /// deliberate settings decision, not a record from the road, and holding
    /// it silently offline would leave the IFTA report looking wrong for no
    /// reason the owner could see.
    @discardableResult func updateTruckIftaFilingScope(truckId: String, iftaReportingEnabled: Bool?) async throws -> String
}

// Demo mode never sends management changes to a real account.
extension LedgerRepository {
    func fetchLoadFormOptions() async throws -> LoadFormOptions { .empty }
    func syncApplePurchase(_ signedTransaction: String) async throws -> ApplePurchaseResult { throw APIError.refused("Inicia sesión para restaurar tus compras.") }
    func changeAccountData(intent: String, confirmation: String) async throws { throw APIError.refused("Inicia sesión para administrar la cuenta.") }
    func fetchCostPerMile() async throws -> CostPerMileSnapshot { throw APIError.refused("Inicia sesión para consultar el costo por milla.") }
    func scanRateCon(data: Data, contentType: String) async throws -> [String: String] { throw APIError.refused("Inicia sesión para leer una confirmación de tarifa.") }
    func fetchAccount() async throws -> AccountSummary { throw APIError.refused("Inicia sesión para consultar tu cuenta.") }
    func fetchDocuments() async throws -> DocumentLibrary { throw APIError.refused("Inicia sesión para consultar tus documentos.") }
    func downloadDocument(_ id: String) async throws -> URL { throw APIError.refused("Inicia sesión para consultar tus documentos.") }
    func deleteStoredDocument(_ id: String) async throws { throw APIError.refused("Inicia sesión para administrar tus documentos.") }
    func uploadDocument(owner: String, entityId: String, type: String, name: String, contentType: String, data: Data) async throws { throw APIError.refused("Inicia sesión para adjuntar documentos.") }

    func downloadInvoice(loadId: String) async throws -> URL {
        throw APIError.refused("Inicia sesión para descargar facturas.")
    }
    func fetchManagement(_ resource: String, quarter: String?) async throws -> ManagementCollection {
        throw APIError.refused("Esta sección necesita una cuenta real. Inicia sesión para consultar y administrar tus registros.")
    }
    func saveManagement(_ resource: String, id: String?, values: [String: String]) async throws {
        throw APIError.refused("Inicia sesión para guardar cambios.")
    }
    func deleteManagement(_ resource: String, id: String) async throws {
        throw APIError.refused("Inicia sesión para eliminar registros.")
    }
}
