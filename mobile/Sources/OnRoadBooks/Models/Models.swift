import Foundation

/// Shared "yyyy-MM-dd" handling for `/api/mobile/*` — the same day-precision
/// format the web app stores (`Load.date`, `Expense.date`).
///
/// The time zone is the device's own, deliberately. These values are calendar
/// days, not instants: a driver fuelling at 8pm in Miami means that day, and
/// formatting through UTC would file the receipt under tomorrow. Reading and
/// writing through the same local calendar also makes a value round trip
/// unchanged.
enum ISODate {
    static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone.current
        return f
    }()

    static func parse(_ string: String) -> Date { formatter.date(from: string) ?? Date() }

    /// The day a picked date falls on, as the API expects to receive it.
    static func day(_ date: Date) -> String { formatter.string(from: date) }
}

// Domain models mirror the JSON shapes `/api/mobile/*` returns (which
// themselves mirror the web app's own dataset — see `Data/APIRepository.swift`
// for the DTO -> domain mapping and `Data/MockRepository.swift` for the
// offline demo data that uses these same types).

struct Load: Identifiable, Hashable {
    let id: String
    let date: Date
    let broker: String
    let origin: String
    let destination: String
    let rate: Double
    let miles: Double
    let deadheadMiles: Double
    let rating: LoadRating
    let profitPerMile: Double

    var lane: String { "\(origin) → \(destination)" }
}

/// The category id and label come straight from the backend's
/// `ExpenseCategoryId` set (`src/lib/categories.ts`) rather than a fixed
/// Swift enum, so a category added on web shows up here with no app update.
struct CategoryTotal: Identifiable {
    let id: String       // e.g. "FUEL" — stable id from the backend
    let label: String    // e.g. "Fuel" — display label from the backend
    let amount: Double
}

struct ExpenseEntry: Identifiable, Hashable {
    let id: String
    let date: Date
    let category: String
    let note: String
    let amount: Double
}

/// One option in the category picker. The list is served by the backend
/// (`/api/mobile/expenses` returns `categories`), never hardcoded here, so a
/// category added on web appears on the phone with no new build.
struct ExpenseCategory: Identifiable, Hashable {
    let id: String
    let label: String
}

/// What one call to `fetchExpenses()` brings back: the entries to show and the
/// categories the add form needs. One request, because the phone is often on
/// one bar of signal at a truck stop.
struct ExpenseLedger {
    let entries: [ExpenseEntry]
    let categories: [ExpenseCategory]
}

// Write models. These carry only what the road actually knows at the moment of
// entry; everything else the web form can set keeps its server-side default.
// The server validates with the SAME zod schema the web form posts through
// (`src/lib/schemas.ts`), so anything refused here would have been refused in a
// browser too -- the phone gets no looser rules.

struct NewExpense {
    var date: Date
    var categoryId: String
    var detail: String
    var vendor: String
    var amount: Double
}

struct NewLoad {
    var date: Date
    var broker: String
    var originCity: String
    var originState: String
    var destinationCity: String
    var destinationState: String
    var grossRate: Double
    var loadedMiles: Double
    var deadheadMiles: Double
    var fuelCost: Double
    var tolls: Double
    var otherExpenses: Double
}

// MARK: - Analytics

struct LanePerformance: Identifiable, Hashable {
    let id: String
    let label: String
    let loadCount: Int
    let revenue: Double
    let profitPerMile: Double
    let deadheadPct: Double
    let rating: LoadRating
    /// Only set on lanes that are not ranked yet.
    let loadsNeeded: Int?
}

struct BrokerPerformance: Identifiable, Hashable {
    var id: String { broker }
    let broker: String
    let loadCount: Int
    let revenue: Double
    let profitPerMile: Double
    let deadheadPct: Double
    let outstanding: Double
    let rating: LoadRating
}

struct AnalyticsSnapshot {
    let periodLabel: String
    /// How many loads a lane needs before it is ranked at all (ADR-0014: refuse
    /// to rank thin data).
    let minLoads: Int
    let qualifiedCount: Int
    let best: [LanePerformance]
    let worst: [LanePerformance]
    let emerging: [LanePerformance]
    let brokers: [BrokerPerformance]
}

// MARK: - IFTA

struct IftaJurisdiction: Identifiable, Hashable {
    var id: String { jurisdiction }
    let jurisdiction: String
    let totalMiles: Double
    let taxableMiles: Double
    let taxPaidGallons: Double
    let netTaxableGallons: Double
    let taxRate: Double?
    let taxDue: Double?
}

struct IftaReport {
    let quarter: String
    let start: Date
    let end: Date
    /// False while miles are unassigned or a jurisdiction has no rate. The
    /// screen then shows what is missing instead of a number that looks filable.
    let complete: Bool
    let totalFleetMiles: Double
    let assignedMiles: Double
    let unassignedMiles: Double
    let totalGallons: Double
    let unassignedGallons: Double
    let fleetMpg: Double
    let missingRateJurisdictions: [String]
    let netTaxDue: Double?
    let jurisdictions: [IftaJurisdiction]
}

// MARK: - The truck

enum DueStatus: String {
    case ok = "OK"
    case dueSoon = "DUE_SOON"
    case overdue = "OVERDUE"
    case unscheduled = "UNSCHEDULED"
}

struct MaintenanceDueItem: Identifiable, Hashable {
    let id: String
    let label: String
    let status: DueStatus
    let dueDate: Date?
    let dueOdometer: Int?
    /// Negative once overdue; nil when the item is not measured that way.
    let milesRemaining: Int?
    let daysRemaining: Int?
}

struct TruckSummary {
    let periodLabel: String
    let name: String
    let detail: String?
    let vin: String?
    let odometer: Int
    let truckCount: Int

    let revenue: Double
    let expenses: Double
    let profit: Double
    let miles: Double
    let costPerMile: Double
    let revenuePerMile: Double
    let profitPerMile: Double
    let loadCount: Int

    /// Nil until the odometer proves it — same rule as the Fuel screen.
    let milesPerGallon: Double?
    let fuelCostPerMile: Double
    let due: [MaintenanceDueItem]
}

// MARK: - Reports

struct ReportSummary: Identifiable, Hashable {
    let id: String
    let label: String
    let description: String
}

/// Columns and rows exactly as `buildReport` defines them on the server, so a
/// report added there shows up here with no new build and no second layout.
struct ReportTable {
    let title: String
    let columns: [String]
    let rows: [[String]]
}

// MARK: - Reserves

/// One savings bucket. Distinct from `ReserveAccount`, which is the trimmed
/// shape the dashboard needs; this carries what the Reserves screen shows.
struct ReserveBucket: Identifiable, Hashable {
    let id: String
    let name: String
    let balance: Double
    let periodContributions: Double
    let periodWithdrawals: Double
    let targetBalance: Double?
    /// Percent of the target. Nil when no target is set — and then the screen
    /// shows no bar at all rather than an empty one.
    let targetProgress: Double?
    let rulePct: Double?
    let ruleBasis: String?

    var ruleLabel: String? {
        guard let rulePct, rulePct > 0 else { return nil }
        let basis = ruleBasis == "GROSS_REVENUE" ? "de los ingresos" : "de la ganancia"
        return "\(Int(rulePct.rounded()))% \(basis)"
    }
}

struct ReserveMovement: Identifiable, Hashable {
    let id: String
    let accountName: String
    let date: Date
    let amount: Double
    let detail: String
    /// Posted by closing a settlement rather than entered by hand.
    let automatic: Bool
}

struct ReserveLedger {
    let periodLabel: String
    let total: Double
    let periodContributions: Double
    let periodWithdrawals: Double
    let safeToPay: Double
    let accounts: [ReserveBucket]
    let movements: [ReserveMovement]
}

// MARK: - Invoices

enum InvoiceStatus: String {
    case pending = "PENDING"
    case invoiced = "INVOICED"
    case paid = "PAID"
}

/// One load, seen as money owed. Freight invoicing is one invoice per load, so
/// the load's id is the invoice's identity — there is no separate record.
struct Invoice: Identifiable, Hashable {
    let loadId: String
    let invoiceNumber: String?
    let loadNumber: String?
    let customer: String?
    let lane: String
    let amount: Double
    let status: InvoiceStatus
    let date: Date
    let invoiceDate: Date?
    let dueDate: Date?
    /// Days past due. Positive means late; nil when there is nothing to be late
    /// for — the server computes it, this app never guesses it from a date.
    let overdueDays: Int?

    var id: String { loadId }
    var isIssued: Bool { invoiceNumber != nil }
    var isOverdue: Bool { (overdueDays ?? 0) > 0 }
    var title: String { invoiceNumber ?? loadNumber ?? "Load sin número" }
}

struct InvoiceSummary {
    let outstandingAmount: Double
    let outstandingCount: Int
    let overdueAmount: Double
    let overdueCount: Int
    let collectedAmount: Double
    let collectedCount: Int
    let uninvoicedCount: Int
}

struct InvoiceLedger {
    let today: Date
    /// The next number in the business's own sequence, computed server-side.
    let suggestedNumber: String
    let summary: InvoiceSummary
    let invoices: [Invoice]
}

struct NewInvoice {
    var invoiceNumber: String
    var invoiceDate: Date
    var dueDate: Date
    var customer: String
}

// MARK: - Fuel

struct FuelStop: Identifiable, Hashable {
    let id: String
    let date: Date
    let gallons: Double
    let pricePerGallon: Double
    let totalCost: Double
    let odometer: Int?
    let location: String?
    let jurisdiction: String?
}

struct FuelSummary {
    let totalGallons: Double
    let totalCost: Double
    let averagePricePerGallon: Double
    let fuelCostPerMile: Double
    let entryCount: Int
    /// Nil until ONE truck has two odometer readings. The web app refuses to
    /// print a number here rather than guess one, and so does this screen —
    /// subtracting one truck's odometer from another's is what produced
    /// triple-digit "MPG" the first time around.
    let milesPerGallon: Double?
    let odometerMiles: Double?
}

struct FuelLedger {
    let summary: FuelSummary
    let entries: [FuelStop]
}

struct NewFuelStop {
    var date: Date
    var gallons: Double
    var pricePerGallon: Double
    var totalCost: Double
    var odometer: Int?
    var location: String
    var jurisdiction: String
}

struct ReserveAccount: Identifiable {
    let id: String
    let name: String
    let contributionLabel: String   // e.g. "20% of profit"
    let monthContribution: Double
    let balance: Double
}

enum SettlementStatus: String { case open = "Open", closed = "Closed" }

struct SettlementPeriod: Identifiable {
    let id: String
    let label: String                 // "Aug 1 – 15"
    let status: SettlementStatus
    let netProfit: Double
    let reserveContributions: Double
    let ownerDraw: Double
}

struct DashboardSnapshot {
    let periodLabel: String            // "August 2026 · Full Month"
    let revenue: Double
    let expenses: Double
    let netProfit: Double
    let revenueDelta: (text: String, direction: PerformanceDirection)
    let netProfitDelta: (text: String, direction: PerformanceDirection)

    let trueCostPerMile: Double
    let safeToPay: Double
    let totalMiles: Double
    let deadheadPct: Double            // 0...1

    let todayRevenue: Double
    let todayLoads: Int

    let expenseBreakdown: [CategoryTotal]
    let recentLoads: [Load]
    let reserves: [ReserveAccount]
}
