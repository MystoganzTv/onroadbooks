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

    private static let dateTimeFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let dateTimeFormatterNoFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    /// A full `new Date().toISOString()` timestamp, like `joinedAt`/`invitedAt` --
    /// different from `parse`, which only ever sees a bare `yyyy-MM-dd`.
    static func parseDateTime(_ string: String?) -> Date? {
        guard let string else { return nil }
        return dateTimeFormatter.date(from: string) ?? dateTimeFormatterNoFraction.date(from: string)
    }
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
    let directTripCosts: Double
    let contributionProfit: Double
    let contributionProfitPerMile: Double
    let allocatedOperatingCosts: Double
    let estimatedFullyLoadedOperatingProfit: Double
    let debtCashBurden: Double
    let allocationBasisLabel: String

    init(
        id: String, date: Date, broker: String, origin: String, destination: String,
        rate: Double, miles: Double, deadheadMiles: Double, rating: LoadRating,
        profitPerMile: Double, directTripCosts: Double? = nil,
        contributionProfit: Double? = nil, allocatedOperatingCosts: Double? = nil,
        estimatedFullyLoadedOperatingProfit: Double? = nil, debtCashBurden: Double? = nil,
        allocationBasisLabel: String = "trailing operating basis"
    ) {
        self.id = id
        self.date = date
        self.broker = broker
        self.origin = origin
        self.destination = destination
        self.rate = rate
        self.miles = miles
        self.deadheadMiles = deadheadMiles
        self.rating = rating
        let totalMiles = miles + deadheadMiles
        let contribution = contributionProfit ?? profitPerMile * totalMiles
        let allocated = allocatedOperatingCosts ?? totalMiles * 0.94
        self.directTripCosts = directTripCosts ?? max(0, rate - contribution)
        self.contributionProfit = contribution
        self.contributionProfitPerMile = profitPerMile
        self.allocatedOperatingCosts = allocated
        self.estimatedFullyLoadedOperatingProfit =
            estimatedFullyLoadedOperatingProfit ?? contribution - allocated
        self.debtCashBurden = debtCashBurden ?? totalMiles * 0.39
        self.allocationBasisLabel = allocationBasisLabel
    }

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

/// The raw record behind a load row, for correcting it.
///
/// The list endpoint returns DERIVED figures — contribution, score, allocated
/// cost — which cannot be edited because they are conclusions. This is what
/// the owner actually typed, from `GET /api/mobile/loads/{id}`.
struct LoadDetail: Identifiable, Equatable {
    let id: String
    var driverId: String?
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
    var status: String
    var invoiceNumber: String?

    /// Dispatch and factoring are not on this screen; the server keeps them.
    var lane: String { "\(originCity), \(originState) → \(destinationCity), \(destinationState)" }
}

/// What the phone changes about a load. Everything it does not show — the
/// IFTA jurisdiction miles, the equipment, the commodity, dispatch and
/// factoring — is merged in by the server and survives untouched.
struct LoadEdit: Equatable {
    /// `nil` means unassigned, and it is sent as an explicit JSON null so it
    /// really unassigns — Swift's synthesized encoder would drop the key and
    /// the server's merge would keep the old driver.
    var driverId: String?
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

// MARK: - Load calculator

/// The bands the account actually saved, not bands the app invented.
struct RatingThresholds: Hashable {
    let great: Double
    let good: Double
    let marginal: Double
}

/// What the calculator starts from, computed from this truck's own ledger.
struct CalculatorDefaults {
    /// Nil when nothing proves it. The app then leaves the field empty and
    /// refuses to estimate rather than assuming a fleet average.
    let fuelPrice: Double?
    let mpg: Double?
    let dispatchPct: Double
    let factoringPct: Double
    /// True cost per mile with fuel, tolls, dispatch and factoring REMOVED —
    /// those four are entered explicitly, and a rate that still contained them
    /// would charge them twice.
    let overheadPerMile: Double
    let debtServicePerMile: Double
    let trueCostPerMile: Double
    let basisLabel: String
    let basisMiles: Double
    /// False when there are not enough recorded miles behind the overhead. The
    /// screen has to say so rather than quietly costing a load against thin data.
    let basisSufficient: Bool
    let debtServiceAvailable: Bool
    let targetProfitPerMile: Double
    let deadheadWarnPct: Double
    let thresholds: RatingThresholds
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
    /// False while miles are unassigned, a jurisdiction has no rate, OR a
    /// truck's filing decision is still pending (see `pendingTruckCount`).
    /// The screen then shows what is missing instead of a number that looks
    /// filable.
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

    /// Same three fields the web's per-truck filing scope added
    /// (`iftaReportingEnabled` on each truck, ADR-adjacent to ADR-0022): a
    /// truck only enters the fleet report once its owner explicitly says so,
    /// separate from unassigned miles or a missing rate.
    let filingScopeComplete: Bool
    let includedTruckCount: Int
    let pendingTruckCount: Int
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
    let id: String
    let name: String
    let detail: String?
    let vin: String?
    let odometer: Int
    let truckCount: Int
    /// Owner's per-truck IFTA filing decision. Nil = no decision made yet,
    /// same three states as the web's Included/Excluded/"Decision needed".
    let iftaReportingEnabled: Bool?

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
    var collectedAmount: Double = 0
    var balanceAmount: Double? = nil
    var paymentEventCount: Int = 0

    var id: String { loadId }
    var isIssued: Bool { invoiceNumber != nil }
    var isOverdue: Bool { (overdueDays ?? 0) > 0 }
    var title: String { invoiceNumber ?? loadNumber ?? "Load sin número" }
    var outstandingAmount: Double { balanceAmount ?? (status == .paid ? 0 : amount) }
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
    let operatingProfit: Double
    let reserveContributions: Double
    let ownerDraw: Double
    /// What closing this window needs. The id is opaque on purpose.
    let month: String?
    let half: String?
    /// OPEN and the period has actually ended. A half-month cannot be closed
    /// while it is still running — the server refuses it and says why.
    let closable: Bool
}

struct DashboardSnapshot {
    let periodLabel: String            // "August 2026 · Full Month"
    let bookedRevenue: Double
    let operatingExpenses: Double
    let operatingProfit: Double
    let bookedRevenueDelta: (text: String, direction: PerformanceDirection)
    let operatingProfitDelta: (text: String, direction: PerformanceDirection)

    let actualCostPerMile: Double
    /// `nil` when the plan or the role does not include owner planning.
    let safeToPay: Double?
    let totalMiles: Double
    let deadheadPct: Double            // 0...1

    let todayBookedRevenue: Double
    let todayOperatingProfit: Double
    let todayLoads: Int
    let todayCashCollected: Double
    let todayNetCashActivity: Double

    let expenseBreakdown: [CategoryTotal]
    let recentLoads: [Load]
    let reserves: [ReserveAccount]
}


/// A correction to an expense already in the books. Only the fields the phone
/// shows — scope, truck, linked load, recurring and the receipt number are
/// merged in by the server and survive untouched.
struct ExpenseDetail: Equatable {
    let id: String
    var date: Date
    var categoryId: String
    var detail: String
    var vendor: String
    var amount: Double
    /// A row the app wrote for you: a fuel or service mirror, or a load's
    /// posted trip cost. Editable only at its source, and the reason says
    /// which source.
    let readOnly: Bool
    let readOnlyReason: String?
}

/// A correction to a fill-up. Editing the entry is what keeps its mirrored
/// FUEL row in the ledger in step; editing that row directly is refused.
struct FuelDetail: Equatable {
    let id: String
    var date: Date
    var gallons: Double
    var pricePerGallon: Double
    var totalCost: Double
    var odometer: Int?
    var location: String
    var jurisdiction: String
}

/// A movement into or out of a reserve bucket. A balance is always the signed
/// sum of these — there is no stored balance to correct.
struct ReserveMovementInput {
    var accountId: String
    var date: Date
    /// CONTRIBUTION | WITHDRAWAL
    var type: String
    var amount: Double
    var description: String
}

/// One driver statement, opened. The lines are the loads it paid for and the
/// adjustments are everything added or taken off afterwards.
struct DriverStatementDetail {
    struct Line: Identifiable, Hashable {
        let id: String
        let loadLabel: String
        let date: String
        let grossRevenue: Double
        let totalMiles: Double
        let payAmount: Double
    }

    struct Adjustment: Identifiable, Hashable {
        let id: String
        let type: String
        let label: String
        let amount: Double
        /// True when it comes OFF the pay: deductions and advances.
        var reducesPay: Bool { type == "DEDUCTION" || type == "ADVANCE" }
    }

    let statement: DriverStatement
    let lines: [Line]
    let adjustments: [Adjustment]
}

// MARK: - Fleet (Fleet plan only)

/// A driver is an OPERATIONAL record and only that. Adding one never creates
/// an app sign-in — that is Access & Roles, a different thing entirely — and
/// this model has no field that could become one.
struct DriverRecord: Identifiable, Hashable {
    let id: String
    let name: String
    let active: Bool
    /// PERCENT_GROSS | PER_LOADED_MILE | PER_TOTAL_MILE | FLAT_PER_LOAD
    let payType: String
    let payRate: Double
    let reference: String?
    let defaultTruckId: String?

    var payDescription: String {
        switch payType {
        case "PERCENT_GROSS":
            return "\(payRate.formatted(.number.precision(.fractionLength(0...1))))% del bruto"
        case "PER_LOADED_MILE":
            return "\(payRate.formatted(.currency(code: "USD").precision(.fractionLength(3)))) / milla cargada"
        case "PER_TOTAL_MILE":
            return "\(payRate.formatted(.currency(code: "USD").precision(.fractionLength(3)))) / milla total"
        default:
            return "\(payRate.formatted(.currency(code: "USD").precision(.fractionLength(2)))) por carga"
        }
    }
}

struct NewDriver {
    var name: String
    var payType: String
    var payRate: Double
    var reference: String?
    var defaultTruckId: String?
    var active: Bool = true
}

/// One truck's own economics. A unit is charged ONLY what it caused; business
/// overhead is reported apart, and its per-mile figure is an allocation.
struct FleetUnit: Identifiable, Hashable {
    var id: String { truckId }
    let truckId: String
    let truckName: String
    let active: Bool
    let loadCount: Int
    let revenue: Double
    let directCosts: Double
    let contribution: Double
    let totalMiles: Double
    let deadheadPct: Double
    let revenuePerMile: Double
    let contributionPerMile: Double
    let actualCostPerMile: Double
}

struct FleetOverview {
    let periodLabel: String
    let revenue: Double
    let directCosts: Double
    let contribution: Double
    /// Real spend that belongs to no single unit.
    let overhead: Double
    let operatingProfit: Double
    let totalMiles: Double
    /// An ALLOCATION, not a cost any one truck incurred.
    let overheadPerMile: Double
    let units: [FleetUnit]
}

/// A frozen driver pay statement. Read-only on the phone: a PAID one is a
/// permanent accounting record.
struct DriverStatement: Identifiable, Hashable {
    let id: String
    let driverName: String
    let periodStart: String
    let periodEnd: String
    /// DRAFT | APPROVED | PAID
    let status: String
    let paidOn: String?
    let loads: Int
    let grossRevenue: Double
    let totalMiles: Double
    let basePay: Double
    let additions: Double
    let deductions: Double
    let advances: Double
    let netPay: Double
}

// MARK: - Access & Roles

/// Mirrors `MemberRole` in `lib/types.ts`. VIEWER stays here only so a legacy
/// row decodes without crashing -- it can no longer be assigned (see
/// `AssignableRole`).
enum MemberRole: String, Decodable {
    case owner = "OWNER"
    case admin = "ADMIN"
    case bookkeeper = "BOOKKEEPER"
    case dispatcher = "DISPATCHER"
    case viewer = "VIEWER"

    var label: String {
        switch self {
        case .owner: return "Dueño"
        case .admin: return "Administrador"
        case .bookkeeper: return "Contable"
        case .dispatcher: return "Despachador"
        case .viewer: return "Solo lectura (heredado)"
        }
    }

    /// Same wording as `ROLE_DEFINITIONS` in `lib/roles.ts`, translated.
    var roleDescription: String {
        switch self {
        case .owner: return "Todo, incluyendo facturación, miembros y la cuenta."
        case .admin: return "Operación y configuración del negocio, sin facturación, accesos, reservas ni pago del dueño."
        case .bookkeeper: return "Gastos, combustible, facturas, cobros, reportes y exportaciones."
        case .dispatcher: return "Loads, conductores, combustible y mantenimiento del camión."
        case .viewer: return "Acceso de solo lectura heredado. Ya no se puede asignar."
        }
    }
}

/// Mirrors `ASSIGNABLE_ROLES` in `lib/roles.ts` -- the only roles a new
/// invite or an existing member's role change can pick.
enum AssignableRole: String, CaseIterable, Identifiable {
    case admin = "ADMIN"
    case bookkeeper = "BOOKKEEPER"
    case dispatcher = "DISPATCHER"

    var id: String { rawValue }
    var role: MemberRole {
        switch self {
        case .admin: return .admin
        case .bookkeeper: return .bookkeeper
        case .dispatcher: return .dispatcher
        }
    }
    var label: String { role.label }
    var roleDescription: String { role.roleDescription }
}

struct TeamMember: Identifiable, Hashable {
    let id: String
    let email: String
    let name: String?
    let role: MemberRole
    let joinedAt: Date?
    let invitedAt: Date?

    static func == (lhs: TeamMember, rhs: TeamMember) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    var displayName: String {
        if let name, !name.trimmingCharacters(in: .whitespaces).isEmpty { return name }
        return String(email.split(separator: "@").first ?? "Miembro")
    }
}

/// What `/api/mobile/team` answers with: the roster, plus whether THIS
/// account may change it. Access & Roles is a Fleet-plan capability on the
/// web (`hasFleetAccess`) -- everyone on the plan can see who has access,
/// only the owner can change it.
struct TeamRoster {
    let canManage: Bool
    let members: [TeamMember]
}
