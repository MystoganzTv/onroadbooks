import Foundation

/// Sample data for design/navigation review before `APIRepository` is
/// wired up. Seeded with OnRoad Books' own real August-2026 demo figures
/// (see project memory `truckledger.md` / `onroadbooks_landing.md`) so the
/// app reads with credible numbers instead of Lorem Ipsum:
///
///   revenue $9,795.00 − expenses $6,143.90 = net $3,651.10
///   true cost/mile $1.84 · reserves (tax 20% of profit, maintenance 5% of
///   revenue, emergency 2% of revenue) = $1,415.87 · safe to pay $2,235.23
///
/// Every figure below ties back to that same arithmetic — if you change
/// one, check the others still add up, exactly like the web app's
/// `PREVIEW_FIGURES` comment insists.
final class MockRepository: LedgerRepository {
    private func date(_ y: Int, _ m: Int, _ d: Int) -> Date {
        Calendar(identifier: .gregorian).date(from: DateComponents(year: y, month: m, day: d))!
    }

    func fetchLoads() async throws -> [Load] {
        [
            Load(id: "1", date: date(2026, 8, 28), broker: "Werner Logistics",
                 origin: "Chicago, IL", destination: "Columbus, OH",
                 rate: 2850, miles: 356, deadheadMiles: 12,
                 rating: .great, profitPerMile: 1.98),
            Load(id: "2", date: date(2026, 8, 25), broker: "TQL",
                 origin: "Dallas, TX", destination: "Memphis, TN",
                 rate: 1640, miles: 452, deadheadMiles: 38,
                 rating: .good, profitPerMile: 1.42),
            Load(id: "3", date: date(2026, 8, 22), broker: "Coyote",
                 origin: "Atlanta, GA", destination: "Charlotte, NC",
                 rate: 980, miles: 244, deadheadMiles: 20,
                 rating: .good, profitPerMile: 1.35),
            Load(id: "4", date: date(2026, 8, 19), broker: "Landstar",
                 origin: "Louisville, KY", destination: "Indianapolis, IN",
                 rate: 640, miles: 114, deadheadMiles: 45,
                 rating: .marginal, profitPerMile: 0.98),
            Load(id: "5", date: date(2026, 8, 14), broker: "Direct Shipper",
                 origin: "Phoenix, AZ", destination: "Albuquerque, NM",
                 rate: 980, miles: 465, deadheadMiles: 210,
                 rating: .bad, profitPerMile: 0.31),
        ]
    }

    func fetchExpenses() async throws -> [ExpenseEntry] {
        [
            ExpenseEntry(id: "e1", date: date(2026, 8, 27), category: "Fuel", note: "Pilot #442 — Joplin, MO", amount: 412.60),
            ExpenseEntry(id: "e2", date: date(2026, 8, 20), category: "Fuel", note: "Loves — Amarillo, TX", amount: 388.10),
            ExpenseEntry(id: "e3", date: date(2026, 8, 15), category: "Truck Payment", note: "Freightliner Cascadia — monthly note", amount: 1284.08),
            ExpenseEntry(id: "e4", date: date(2026, 8, 12), category: "Maintenance & Repairs", note: "Oil change + DOT inspection", amount: 340.00),
            ExpenseEntry(id: "e5", date: date(2026, 8, 9), category: "Insurance", note: "Progressive Commercial — monthly premium", amount: 681.97),
            ExpenseEntry(id: "e6", date: date(2026, 8, 5), category: "Other", note: "ELD subscription + phone plan", amount: 214.50),
        ]
    }

    func fetchSettlements() async throws -> [SettlementPeriod] {
        [
            SettlementPeriod(id: "s-aug-16", label: "Aug 16 – 31", status: .open, netProfit: 1802.40, reserveContributions: 0, ownerDraw: 0),
            SettlementPeriod(id: "s-aug-01", label: "Aug 1 – 15", status: .closed, netProfit: 1848.70, reserveContributions: 703.10, ownerDraw: 1145.60),
            SettlementPeriod(id: "s-jul-16", label: "Jul 16 – 31", status: .closed, netProfit: 1710.05, reserveContributions: 649.90, ownerDraw: 1060.15),
            SettlementPeriod(id: "s-jul-01", label: "Jul 1 – 15", status: .closed, netProfit: 1594.30, reserveContributions: 606.20, ownerDraw: 988.10),
        ]
    }

    func fetchDashboard() async throws -> DashboardSnapshot {
        let revenue = 9795.00
        let expenses = 6143.90
        let netProfit = revenue - expenses // 3651.10

        let breakdown: [CategoryTotal] = [
            .init(id: "FUEL", label: "Fuel", amount: 1320.94),
            .init(id: "TRUCK_PAYMENT", label: "Truck Payment", amount: 1284.08),
            .init(id: "TOLLS_DISPATCH_FACTORING", label: "Tolls, Dispatch & Factoring", amount: 952.30),
            .init(id: "MAINTENANCE", label: "Maintenance & Repairs", amount: 897.01),
            .init(id: "INSURANCE", label: "Insurance", amount: 681.97),
            .init(id: "OTHER", label: "Other", amount: 1007.60),
        ]

        let reserves: [ReserveAccount] = [
            .init(id: "tax", name: "Tax", contributionLabel: "20% of profit", monthContribution: 730.22, balance: 2412.66),
            .init(id: "maint", name: "Maintenance", contributionLabel: "5% of revenue", monthContribution: 489.75, balance: 1469.25),
            .init(id: "emerg", name: "Emergency", contributionLabel: "2% of revenue", monthContribution: 195.90, balance: 587.70),
        ]

        return DashboardSnapshot(
            periodLabel: "August 2026 · Full Month",
            revenue: revenue,
            expenses: expenses,
            netProfit: netProfit,
            revenueDelta: ("+8.4% vs Jul", .up),
            netProfitDelta: ("+12.1% vs Jul", .up),
            trueCostPerMile: 1.84,
            safeToPay: 2235.23,
            totalMiles: 3339,
            deadheadPct: 0.265,
            todayRevenue: 420,
            todayLoads: 1,
            expenseBreakdown: breakdown,
            recentLoads: try await fetchLoads(),
            reserves: reserves
        )
    }
}
