import Foundation

/// Shared "yyyy-MM-dd" parsing for dates coming back from `/api/mobile/*`
/// — the same day-precision format the web app stores (`Load.date`,
/// `Expense.date`).
enum ISODate {
    static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = TimeZone(identifier: "UTC")
        return f
    }()
    static func parse(_ string: String) -> Date { formatter.date(from: string) ?? Date() }
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
