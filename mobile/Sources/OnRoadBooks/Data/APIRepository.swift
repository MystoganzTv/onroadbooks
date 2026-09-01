import Foundation

enum APIError: LocalizedError {
    case unauthorized
    case requestFailed
    case decodingFailed
    /// The server understood the request and refused it, in its own words.
    case refused(String)
    /// The request never produced an answer. `TransportFailure.neverSent` says
    /// whether the server could have acted on it anyway.
    case transport(TransportFailure)
    /// Sent, then the connection died. We do not know if it landed.
    case unconfirmed

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "Tu sesión expiró. Entra de nuevo."
        case .requestFailed: return "No se pudo conectar. Revisa la señal e intenta otra vez."
        case .decodingFailed: return "El servidor respondió algo que la app no entiende."
        case .refused(let message): return message
        case .transport(let failure): return failure.message
        case .unconfirmed:
            return "Se perdió la conexión al enviarlo y no sabemos si se guardó. Quedó en Pendientes para que lo revises."
        }
    }
}

/// Talks to the `/api/mobile/*` routes in the OnRoad Books web app — a plain
/// HTTP client, no database driver (see project memory `onroadbooks_mobile.md`).
///
/// Writes go through `WriteQueue` when there is no signal, which is most of a
/// long haul. The rule those two share: a write is only ever sent again by
/// itself when we know the server never saw it.
final class APIRepository: LedgerRepository {
    private let client: APIClient
    private let queue: WriteQueue?
    private let isOnline: () -> Bool

    init(
        baseURL: URL = APIConfig.baseURL,
        tokenProvider: @escaping () -> String?,
        queue: WriteQueue? = nil,
        isOnline: @escaping () -> Bool = { true }
    ) {
        client = APIClient(baseURL: baseURL, tokenProvider: tokenProvider)
        self.queue = queue
        self.isOnline = isOnline
    }

    private func get<T: Decodable>(_ path: String, as type: T.Type) async throws -> T {
        let (data, http) = try await client.send(client.request(path, method: "GET"))
        if http.statusCode == 401 { throw APIError.unauthorized }
        if http.statusCode == 403,
           let refusal = try? JSONDecoder().decode(RefusalResponse.self, from: data) {
            // A plan gate, in the owner's own words. "No se pudo conectar"
            // would be a lie about a request that worked perfectly.
            throw APIError.refused(refusal.error)
        }
        guard http.statusCode == 200 else { throw APIError.requestFailed }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decodingFailed
        }
    }

    /// POST a write, or hold it until there is signal.
    ///
    /// `summary` and `amount` are what the owner will see in Pendientes, so
    /// they are written for a person, not for a log.
    private func post<Body: Encodable>(
        _ path: String,
        body: Body,
        summary: String,
        amount: Double? = nil
    ) async throws -> String {
        let encoded = try JSONEncoder().encode(body)

        // Known offline: queue it without attempting. Nothing ambiguous ever
        // enters the queue this way, which is the whole point of asking first.
        if let queue, !isOnline() {
            return await MainActor.run {
                queue.enqueue(path: path, body: encoded, summary: summary, amount: amount)
            }
        }

        do {
            let (data, http) = try await client.send(client.post(path, body: encoded))
            return try APIClient.outcome(data, http)
        } catch APIError.transport(let failure) {
            guard let queue else { throw APIError.transport(failure) }
            if failure.neverSent {
                return await MainActor.run {
                    queue.enqueue(path: path, body: encoded, summary: summary, amount: amount)
                }
            }
            // Died in flight. It may be in the ledger already, so it waits for
            // a person rather than retrying itself.
            await MainActor.run {
                queue.enqueue(
                    path: path, body: encoded, summary: summary, amount: amount,
                    state: .attention,
                    note: "Se perdió la conexión al enviarlo. Puede que ya esté guardado — revísalo antes de reintentar."
                )
            }
            throw APIError.unconfirmed
        }
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
        try await post("api/mobile/loads", body: NewLoadDTO(load),
                       summary: "Load \(load.originCity) → \(load.destinationCity)", amount: load.grossRate)
    }

    @discardableResult
    func createExpense(_ expense: NewExpense) async throws -> String {
        try await post("api/mobile/expenses", body: NewExpenseDTO(expense),
                       summary: "Gasto \(expense.detail)", amount: expense.amount)
    }

    func fetchFuel() async throws -> FuelLedger {
        try await get("api/mobile/fuel", as: FuelResponseDTO.self).toDomain()
    }

    @discardableResult
    func createFuelStop(_ stop: NewFuelStop) async throws -> String {
        try await post("api/mobile/fuel", body: NewFuelDTO(stop),
                       summary: "Combustible \(stop.location.isEmpty ? "sin lugar" : stop.location)", amount: stop.totalCost)
    }

    /// Multipart, because that is what the web upload route already speaks and
    /// what the storage adapter on the other side expects — the photo is not
    /// re-encoded into JSON just to please the phone.
    @discardableResult
    func attachReceipt(expenseId: String, jpeg: Data) async throws -> String {
        let boundary = "onroad-\(UUID().uuidString)"
        var body = Data()

        func field(_ name: String, _ value: String) {
            body.append(Data("--\(boundary)\r\n".utf8))
            body.append(Data("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".utf8))
            body.append(Data("\(value)\r\n".utf8))
        }

        field("owner", "EXPENSE")
        field("entityId", expenseId)
        field("type", "RECEIPT")

        let fileName = "recibo-\(ISODate.day(Date())).jpg"
        body.append(Data("--\(boundary)\r\n".utf8))
        body.append(Data("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"\r\n".utf8))
        body.append(Data("Content-Type: image/jpeg\r\n\r\n".utf8))
        body.append(jpeg)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))

        var request = client.request("api/mobile/documents", method: "POST")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = body

        let (data, http) = try await client.send(request)
        return try APIClient.outcome(data, http)
    }

    func fetchReserves() async throws -> ReserveLedger {
        try await get("api/mobile/reserves", as: ReservesResponseDTO.self).toDomain()
    }

    func fetchInvoices() async throws -> InvoiceLedger {
        try await get("api/mobile/invoices", as: InvoicesResponseDTO.self).toDomain()
    }

    @discardableResult
    func issueInvoice(loadId: String, _ invoice: NewInvoice) async throws -> String {
        try await post("api/mobile/invoices/\(loadId)", body: IssueInvoiceDTO(invoice),
                       summary: "Factura \(invoice.invoiceNumber) a \(invoice.customer)")
    }

    @discardableResult
    func markInvoicePaid(loadId: String, on date: Date) async throws -> String {
        try await post("api/mobile/invoices/\(loadId)", body: MarkPaidDTO(paidOn: ISODate.day(date)),
                       summary: "Marcar factura cobrada")
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

private struct FuelResponseDTO: Decodable {
    struct Summary: Decodable {
        let totalGallons: Double
        let totalCost: Double
        let averagePricePerGallon: Double
        let fuelCostPerMile: Double
        let entryCount: Int
        let milesPerGallon: Double?
        let odometerMiles: Double?
    }

    struct Entry: Decodable {
        let id: String
        let date: String
        let gallons: Double
        let pricePerGallon: Double
        let totalCost: Double
        let odometer: Double?
        let location: String?
        let jurisdiction: String?
    }

    let periodLabel: String
    let summary: Summary
    let entries: [Entry]

    func toDomain() -> FuelLedger {
        FuelLedger(
            summary: FuelSummary(
                totalGallons: summary.totalGallons,
                totalCost: summary.totalCost,
                averagePricePerGallon: summary.averagePricePerGallon,
                fuelCostPerMile: summary.fuelCostPerMile,
                entryCount: summary.entryCount,
                milesPerGallon: summary.milesPerGallon,
                odometerMiles: summary.odometerMiles
            ),
            entries: entries.map { entry in
                FuelStop(
                    id: entry.id,
                    date: ISODate.parse(entry.date),
                    gallons: entry.gallons,
                    pricePerGallon: entry.pricePerGallon,
                    totalCost: entry.totalCost,
                    odometer: entry.odometer.map { Int($0) },
                    location: entry.location,
                    jurisdiction: entry.jurisdiction
                )
            }
        )
    }
}

private struct NewFuelDTO: Encodable {
    let date: String
    let gallons: Double
    let pricePerGallon: Double
    let totalCost: Double
    let odometer: Int?
    let location: String?
    let jurisdiction: String?

    init(_ stop: NewFuelStop) {
        date = ISODate.day(stop.date)
        gallons = stop.gallons
        pricePerGallon = stop.pricePerGallon
        totalCost = stop.totalCost
        odometer = stop.odometer
        location = stop.location.isEmpty ? nil : stop.location
        jurisdiction = stop.jurisdiction.isEmpty ? nil : stop.jurisdiction.uppercased()
    }
}

private struct ReservesResponseDTO: Decodable {
    struct Account: Decodable {
        let id: String
        let name: String
        let balance: Double
        let periodContributions: Double
        let periodWithdrawals: Double
        let targetBalance: Double?
        let targetProgress: Double?
        let rulePct: Double?
        let ruleBasis: String?
    }

    struct Movement: Decodable {
        let id: String
        let accountName: String
        let date: String
        let amount: Double
        let description: String
        let automatic: Bool
    }

    let periodLabel: String
    let total: Double
    let periodContributions: Double
    let periodWithdrawals: Double
    let safeToPay: Double
    let accounts: [Account]
    let movements: [Movement]

    func toDomain() -> ReserveLedger {
        ReserveLedger(
            periodLabel: periodLabel,
            total: total,
            periodContributions: periodContributions,
            periodWithdrawals: periodWithdrawals,
            safeToPay: safeToPay,
            accounts: accounts.map {
                ReserveBucket(
                    id: $0.id, name: $0.name, balance: $0.balance,
                    periodContributions: $0.periodContributions,
                    periodWithdrawals: $0.periodWithdrawals,
                    targetBalance: $0.targetBalance, targetProgress: $0.targetProgress,
                    rulePct: $0.rulePct, ruleBasis: $0.ruleBasis
                )
            },
            movements: movements.map {
                ReserveMovement(
                    id: $0.id, accountName: $0.accountName, date: ISODate.parse($0.date),
                    amount: $0.amount, detail: $0.description, automatic: $0.automatic
                )
            }
        )
    }
}

private struct InvoicesResponseDTO: Decodable {
    struct Summary: Decodable {
        let outstandingAmount: Double
        let outstandingCount: Int
        let overdueAmount: Double
        let overdueCount: Int
        let collectedAmount: Double
        let collectedCount: Int
        let uninvoicedCount: Int
    }

    struct Row: Decodable {
        let loadId: String
        let invoiceNumber: String?
        let loadNumber: String?
        let customer: String?
        let lane: String
        let amount: Double
        let status: String
        let date: String
        let invoiceDate: String?
        let invoiceDueDate: String?
        let overdueDays: Int?
    }

    let today: String
    let suggestedNumber: String
    let summary: Summary
    let invoices: [Row]

    func toDomain() -> InvoiceLedger {
        InvoiceLedger(
            today: ISODate.parse(today),
            suggestedNumber: suggestedNumber,
            summary: InvoiceSummary(
                outstandingAmount: summary.outstandingAmount,
                outstandingCount: summary.outstandingCount,
                overdueAmount: summary.overdueAmount,
                overdueCount: summary.overdueCount,
                collectedAmount: summary.collectedAmount,
                collectedCount: summary.collectedCount,
                uninvoicedCount: summary.uninvoicedCount
            ),
            invoices: invoices.map { row in
                Invoice(
                    loadId: row.loadId,
                    invoiceNumber: row.invoiceNumber,
                    loadNumber: row.loadNumber,
                    customer: row.customer,
                    lane: row.lane,
                    amount: row.amount,
                    status: InvoiceStatus(rawValue: row.status) ?? .pending,
                    date: ISODate.parse(row.date),
                    invoiceDate: row.invoiceDate.map(ISODate.parse),
                    dueDate: row.invoiceDueDate.map(ISODate.parse),
                    overdueDays: row.overdueDays
                )
            }
        )
    }
}

private struct IssueInvoiceDTO: Encodable {
    let intent = "issue"
    let invoiceNumber: String
    let invoiceDate: String
    let invoiceDueDate: String
    let billToName: String

    init(_ invoice: NewInvoice) {
        invoiceNumber = invoice.invoiceNumber
        invoiceDate = ISODate.day(invoice.invoiceDate)
        invoiceDueDate = ISODate.day(invoice.dueDate)
        billToName = invoice.customer
    }
}

private struct MarkPaidDTO: Encodable {
    let intent = "paid"
    let paidOn: String
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
