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
