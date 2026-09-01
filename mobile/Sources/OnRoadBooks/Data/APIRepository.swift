import Foundation

enum APIError: LocalizedError {
    case unauthorized
    case requestFailed
    case decodingFailed
    /// The server understood the request and refused it, in its own words.
    case refused(String)

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "Tu sesión expiró. Entra de nuevo."
        case .requestFailed: return "No se pudo conectar. Revisa la señal e intenta otra vez."
        case .decodingFailed: return "El servidor respondió algo que la app no entiende."
        case .refused(let message): return message
        }
    }
}

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

    private func authorized(_ path: String, method: String) -> URLRequest {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        if let token = tokenProvider() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private func get<T: Decodable>(_ path: String, as type: T.Type) async throws -> T {
        let (data, response) = try await URLSession.shared.data(for: authorized(path, method: "GET"))
        guard let http = response as? HTTPURLResponse else { throw APIError.requestFailed }
        if http.statusCode == 401 { throw APIError.unauthorized }
        guard http.statusCode == 200 else { throw APIError.requestFailed }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decodingFailed
        }
    }

    /// POST a body and return the created record's id.
    ///
    /// A refusal from the ledger is not a network failure: 4xx responses carry
    /// `{ error, fieldErrors }` written for the owner, so surface that sentence
    /// instead of a generic "something went wrong". A 422 also names the field,
    /// which is worth more than the summary line on a small screen.
    private func post<Body: Encodable>(_ path: String, body: Body) async throws -> String {
        var request = authorized(path, method: "POST")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.requestFailed }
        if http.statusCode == 401 { throw APIError.unauthorized }

        if http.statusCode == 201 {
            guard let created = try? JSONDecoder().decode(CreatedDTO.self, from: data) else {
                throw APIError.decodingFailed
            }
            return created.id
        }

        if let refusal = try? JSONDecoder().decode(RefusalDTO.self, from: data) {
            let field = refusal.fieldErrors?.sorted(by: { $0.key < $1.key }).first
            throw APIError.refused(field.map { "\($0.value)" } ?? refusal.error)
        }
        throw APIError.requestFailed
    }

    func fetchDashboard() async throws -> DashboardSnapshot {
        try await get("api/mobile/dashboard", as: DashboardDTO.self).toDomain()
    }

    func fetchLoads() async throws -> [Load] {
        try await get("api/mobile/loads", as: LoadsResponseDTO.self).loads.map { $0.toDomain() }
    }

    func fetchExpenses() async throws -> ExpenseLedger {
        let response = try await get("api/mobile/expenses", as: ExpensesResponseDTO.self)
        return ExpenseLedger(
            entries: response.expenses.map { $0.toDomain() },
            categories: response.categories.map { ExpenseCategory(id: $0.id, label: $0.label) }
        )
    }

    @discardableResult
    func createLoad(_ load: NewLoad) async throws -> String {
        try await post("api/mobile/loads", body: NewLoadDTO(load))
    }

    @discardableResult
    func createExpense(_ expense: NewExpense) async throws -> String {
        try await post("api/mobile/expenses", body: NewExpenseDTO(expense))
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

private struct CategoryOptionDTO: Decodable {
    let id: String
    let label: String
}

private struct ExpensesResponseDTO: Decodable {
    let periodLabel: String
    let expenses: [ExpenseDTO]
    let categories: [CategoryOptionDTO]
}

private struct CreatedDTO: Decodable { let id: String }

private struct RefusalDTO: Decodable {
    let error: String
    let fieldErrors: [String: String]?
}

/// Exactly the fields `loadSchema` requires. The trip-cost fields the phone
/// does not ask for are sent as 0 rather than omitted, because the schema
/// requires them and a silent default is worse than a visible zero.
private struct NewLoadDTO: Encodable {
    let date: String
    let broker: String?
    let originCity: String
    let originState: String
    let destinationCity: String
    let destinationState: String
    let grossRate: Double
    let loadedMiles: Double
    let deadheadMiles: Double
    let fuelCost: Double
    let tolls: Double
    let dispatchFee: Double
    let factoringFee: Double
    let otherExpenses: Double
    let status: String

    init(_ load: NewLoad) {
        date = ISODate.day(load.date)
        broker = load.broker.isEmpty ? nil : load.broker
        originCity = load.originCity
        originState = load.originState.uppercased()
        destinationCity = load.destinationCity
        destinationState = load.destinationState.uppercased()
        grossRate = load.grossRate
        loadedMiles = load.loadedMiles
        deadheadMiles = load.deadheadMiles
        fuelCost = load.fuelCost
        tolls = load.tolls
        dispatchFee = 0
        factoringFee = 0
        otherExpenses = load.otherExpenses
        status = "PENDING"
    }
}

private struct NewExpenseDTO: Encodable {
    let date: String
    let category: String
    let description: String
    let vendor: String?
    let amount: Double
    let recurring: Bool

    init(_ expense: NewExpense) {
        date = ISODate.day(expense.date)
        category = expense.categoryId
        description = expense.detail
        vendor = expense.vendor.isEmpty ? nil : expense.vendor
        amount = expense.amount
        // A one-off receipt from the road. Recurring costs are set up once, in
        // Settings on the web, not re-entered at a pump.
        recurring = false
    }
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
