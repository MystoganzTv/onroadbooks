import Foundation

enum APIError: Error { case unauthorized, requestFailed, decodingFailed }

/// Talks to the `/api/mobile/*` routes added to the OnRoad Books web app —
/// see that repo's `src/lib/auth/mobile.ts` and project memory
/// `onroadbooks_mobile.md` for why this is a plain HTTP client and not a
/// database client. Every route is read-only for now.
final class APIRepository: LedgerRepository {
    private let baseURL: URL
    private let tokenProvider: () -> String?

    init(baseURL: URL = APIConfig.baseURL, tokenProvider: @escaping () -> String?) {
        self.baseURL = baseURL
        self.tokenProvider = tokenProvider
    }

    private func get<T: Decodable>(_ path: String, as type: T.Type) async throws -> T {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        if let token = tokenProvider() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.requestFailed }
        if http.statusCode == 401 { throw APIError.unauthorized }
        guard http.statusCode == 200 else { throw APIError.requestFailed }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decodingFailed
        }
    }

    func fetchDashboard() async throws -> DashboardSnapshot {
        try await get("api/mobile/dashboard", as: DashboardDTO.self).toDomain()
    }

    func fetchLoads() async throws -> [Load] {
        try await get("api/mobile/loads", as: LoadsResponseDTO.self).loads.map { $0.toDomain() }
    }

    func fetchExpenses() async throws -> [ExpenseEntry] {
        try await get("api/mobile/expenses", as: ExpensesResponseDTO.self).expenses.map { $0.toDomain() }
    }

    func fetchSettlements() async throws -> [SettlementPeriod] {
        try await get("api/mobile/settlements", as: SettlementsResponseDTO.self).settlements.map { $0.toDomain() }
    }
}

// MARK: - Wire types (exact shape of the JSON the web routes return)

private struct LoadDTO: Decodable {
    let id: String
    let date: String
    let broker: String?
    let originCity: String
    let originState: String
    let destinationCity: String
    let destinationState: String
    let grossRate: Double
    let loadedMiles: Double
    let deadheadMiles: Double
    let profitPerMile: Double
    let rating: String

    func toDomain() -> Load {
        Load(
            id: id,
            date: ISODate.parse(date),
            broker: broker ?? "Direct",
            origin: "\(originCity), \(originState)",
            destination: "\(destinationCity), \(destinationState)",
            rate: grossRate,
            miles: loadedMiles,
            deadheadMiles: deadheadMiles,
            rating: LoadRating(rawValue: rating) ?? .marginal,
            profitPerMile: profitPerMile
        )
    }
}

private struct LoadsResponseDTO: Decodable {
    let periodLabel: String
    let loads: [LoadDTO]
}

private struct ExpenseDTO: Decodable {
    let id: String
    let date: String
    let category: String
    let categoryLabel: String
    let description: String
    let vendor: String?
    let amount: Double

    func toDomain() -> ExpenseEntry {
        let note = [description, vendor].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " — ")
        return ExpenseEntry(id: id, date: ISODate.parse(date), category: categoryLabel,
                             note: note.isEmpty ? categoryLabel : note, amount: amount)
    }
}

private struct ExpensesResponseDTO: Decodable {
    let periodLabel: String
    let expenses: [ExpenseDTO]
}

private struct SettlementDTO: Decodable {
    let id: String
    let label: String
    let status: String
    let netProfit: Double
    let reserveTotal: Double
    let safeToPay: Double
    let drifted: Bool

    func toDomain() -> SettlementPeriod {
        SettlementPeriod(
            id: id,
            label: label,
            status: status == "OPEN" ? .open : .closed,
            netProfit: netProfit,
            reserveContributions: reserveTotal,
            ownerDraw: safeToPay
        )
    }
}

private struct SettlementsResponseDTO: Decodable {
    let settlements: [SettlementDTO]
}

private struct DashboardDTO: Decodable {
    struct Today: Decodable { let revenue: Double; let loadCount: Int }
    struct Category: Decodable { let category: String; let label: String; let amount: Double }
    struct Reserve: Decodable { let id: String; let name: String; let contributionPct: Double?; let balance: Double }

    let periodLabel: String
    let revenue: Double
    let expenses: Double
    let netProfit: Double
    let revenueDeltaPct: Double
    let netProfitDeltaPct: Double
    let trueCostPerMile: Double
    let safeToPay: Double
    let totalMiles: Double
    let deadheadPct: Double
    let today: Today
    let expenseBreakdown: [Category]
    let recentLoads: [LoadDTO]
    let reserves: [Reserve]

    private func delta(_ pct: Double) -> (text: String, direction: PerformanceDirection) {
        let direction: PerformanceDirection = pct > 0.05 ? .up : pct < -0.05 ? .down : .neutral
        let sign = pct > 0 ? "+" : ""
        return ("\(sign)\(String(format: "%.1f", pct))% vs prior period", direction)
    }

    func toDomain() -> DashboardSnapshot {
        DashboardSnapshot(
            periodLabel: periodLabel,
            revenue: revenue,
            expenses: expenses,
            netProfit: netProfit,
            revenueDelta: delta(revenueDeltaPct),
            netProfitDelta: delta(netProfitDeltaPct),
            trueCostPerMile: trueCostPerMile,
            safeToPay: safeToPay,
            totalMiles: totalMiles,
            deadheadPct: deadheadPct / 100, // server sends 0...100
            todayRevenue: today.revenue,
            todayLoads: today.loadCount,
            expenseBreakdown: expenseBreakdown.map { CategoryTotal(id: $0.category, label: $0.label, amount: $0.amount) },
            recentLoads: recentLoads.map { $0.toDomain() },
            reserves: reserves.map { reserve in
                ReserveAccount(
                    id: reserve.id,
                    name: reserve.name,
                    contributionLabel: reserve.contributionPct.map { "\(Int($0))% contribution" } ?? "Manual",
                    monthContribution: 0, // not returned by /api/mobile/dashboard today
                    balance: reserve.balance
                )
            }
        )
    }
}
