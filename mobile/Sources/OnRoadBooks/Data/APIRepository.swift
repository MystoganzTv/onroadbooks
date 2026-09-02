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

    private func get<T: Decodable>(
        _ path: String,
        query: [URLQueryItem] = [],
        as type: T.Type
    ) async throws -> T {
        var request = client.request(path, method: "GET")
        if !query.isEmpty, let url = request.url,
           var components = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            components.queryItems = query
            request.url = components.url
        }

        let (data, http) = try await client.send(request)
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

    /// A write with no queue behind it at all -- used only where holding it
    /// for later signal would be the wrong default (see `Repository.swift`).
    /// Same transport and same `APIClient.outcome` decoding as `post`, minus
    /// the offline branch.
    private func directWrite<Body: Encodable>(_ path: String, method: String, body: Body) async throws -> String {
        var request = client.request(path, method: method)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, http) = try await client.send(request)
        return try APIClient.outcome(data, http)
    }

    /// A write with no body and no queue: DELETE.
    private func directDelete(_ path: String) async throws {
        let request = client.request(path, method: "DELETE")
        let (data, http) = try await client.send(request)
        _ = try APIClient.outcome(data, http)
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

    func fetchTeam() async throws -> TeamRoster {
        try await get("api/mobile/team", as: TeamResponseDTO.self).toDomain()
    }

    @discardableResult
    func inviteTeamMember(email: String, name: String?, role: AssignableRole) async throws -> String {
        try await directWrite(
            "api/mobile/team", method: "POST",
            body: InviteMemberDTO(email: email, name: name, role: role.rawValue)
        )
    }

    @discardableResult
    func updateTeamMemberRole(userId: String, role: AssignableRole) async throws -> String {
        try await directWrite(
            "api/mobile/team/\(userId)", method: "PATCH",
            body: UpdateMemberRoleDTO(role: role.rawValue)
        )
    }

    func removeTeamMember(userId: String) async throws {
        let (data, http) = try await client.send(client.request("api/mobile/team/\(userId)", method: "DELETE"))
        _ = try APIClient.outcome(data, http)
    }

    func fetchTruck() async throws -> TruckSummary {
        try await get("api/mobile/truck", as: TruckResponseDTO.self).toDomain()
    }

    @discardableResult
    func updateTruckIftaFilingScope(truckId: String, iftaReportingEnabled: Bool?) async throws -> String {
        try await directWrite(
            "api/mobile/truck", method: "PATCH",
            body: UpdateTruckIftaScopeDTO(truckId: truckId, iftaReportingEnabled: iftaReportingEnabled)
        )
    }

    func fetchAnalytics() async throws -> AnalyticsSnapshot {
        try await get("api/mobile/analytics", as: AnalyticsResponseDTO.self).toDomain()
    }

    func fetchCalculatorDefaults() async throws -> CalculatorDefaults {
        try await get("api/mobile/calculator", as: CalculatorDefaultsDTO.self).toDomain()
    }

    func fetchIfta(quarter: String?) async throws -> IftaReport {
        try await get(
            "api/mobile/ifta",
            query: quarter.map { [URLQueryItem(name: "quarter", value: $0)] } ?? [],
            as: IftaResponseDTO.self
        ).toDomain()
    }

    func fetchReports() async throws -> [ReportSummary] {
        try await get("api/mobile/reports", as: ReportsResponseDTO.self)
            .reports.map { ReportSummary(id: $0.id, label: $0.label, description: $0.description) }
    }

    func fetchReportTable(_ reportId: String) async throws -> ReportTable {
        let response = try await get("api/mobile/reports/\(reportId)", as: ReportTableResponseDTO.self)
        return ReportTable(
            title: response.table.title,
            columns: response.table.columns,
            rows: response.table.rows.map { row in row.map(\.text) }
        )
    }

    func downloadYearEndPacket(year: Int) async throws -> URL {
        var request = client.request("api/mobile/year-end", method: "GET")
        if let url = request.url,
           var components = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            components.queryItems = [URLQueryItem(name: "year", value: String(year))]
            request.url = components.url
        }
        return try await download(request, fallbackName: "onroad-books-\(year).xlsx")
    }

    func downloadReport(_ reportId: String, format: String) async throws -> URL {
        var request = client.request("api/mobile/reports/\(reportId)", method: "GET")
        if let url = request.url,
           var components = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            components.queryItems = [URLQueryItem(name: "format", value: format)]
            request.url = components.url
        }

        return try await download(request, fallbackName: "\(reportId).\(format)")
    }

    /// Saves a response body to a temporary file for the share sheet, keeping
    /// the name the server chose — it already spells out the business, the
    /// period and the truck, which is what the accountant will see.
    private func download(_ request: URLRequest, fallbackName: String) async throws -> URL {
        let (data, http) = try await client.send(request)
        if http.statusCode == 401 { throw APIError.unauthorized }
        if http.statusCode == 403,
           let refusal = try? JSONDecoder().decode(RefusalResponse.self, from: data) {
            throw APIError.refused(refusal.error)
        }
        guard http.statusCode == 200 else { throw APIError.requestFailed }

        let name = http.value(forHTTPHeaderField: "Content-Disposition")
            .flatMap { header -> String? in
                guard let range = header.range(of: "filename=\"") else { return nil }
                let rest = header[range.upperBound...]
                guard let end = rest.firstIndex(of: "\"") else { return nil }
                return String(rest[..<end])
            } ?? fallbackName

        let destination = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        try? FileManager.default.removeItem(at: destination)
        try data.write(to: destination, options: .atomic)
        return destination
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

    @discardableResult
    func recordInvoicePayment(loadId: String, amount: Double, on date: Date) async throws -> String {
        try await post(
            "api/mobile/invoices/\(loadId)",
            body: RecordPaymentDTO(date: ISODate.day(date), amount: amount),
            summary: "Registrar pago parcial"
        )
    }

    func fetchLoadDetail(id: String) async throws -> LoadDetail {
        try await get("api/mobile/loads/\(id)", as: LoadDetailResponseDTO.self).load.toDomain()
    }

    @discardableResult
    func updateLoad(id: String, _ change: LoadEdit) async throws -> String {
        try await directWrite("api/mobile/loads/\(id)", method: "PATCH", body: LoadEditDTO(change))
    }

    func deleteLoad(id: String) async throws {
        try await directDelete("api/mobile/loads/\(id)")
    }

    func deleteExpense(id: String) async throws {
        try await directDelete("api/mobile/expenses/\(id)")
    }

    func deleteFuelStop(id: String) async throws {
        try await directDelete("api/mobile/fuel/\(id)")
    }

    @discardableResult
    func setSettlementStatus(month: String, half: String, closed: Bool) async throws -> String {
        try await directWrite(
            "api/mobile/settlements",
            method: "PATCH",
            body: SettlementStatusDTO(month: month, half: half, status: closed ? "CLOSED" : "OPEN")
        )
    }

    func fetchDrivers() async throws -> [DriverRecord] {
        try await get("api/mobile/drivers", as: DriversResponseDTO.self).drivers.map { $0.toDomain() }
    }

    @discardableResult
    func createDriver(_ driver: NewDriver) async throws -> String {
        try await directWrite("api/mobile/drivers", method: "POST", body: NewDriverDTO(driver))
    }

    @discardableResult
    func setDriverActive(id: String, active: Bool) async throws -> String {
        try await directWrite("api/mobile/drivers/\(id)", method: "PATCH", body: DriverActiveDTO(active: active))
    }

    func fetchFleet() async throws -> FleetOverview {
        try await get("api/mobile/fleet", as: FleetResponseDTO.self).toDomain()
    }

    func fetchDriverStatements() async throws -> [DriverStatement] {
        try await get("api/mobile/driver-settlements", as: DriverStatementsResponseDTO.self)
            .statements.map { $0.toDomain() }
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
    let directTripCosts: Double
    let contributionProfit: Double
    let contributionProfitPerMile: Double
    let allocatedOperatingCosts: Double
    let estimatedFullyLoadedOperatingProfit: Double
    let debtCashBurden: Double
    let allocationBasisLabel: String
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
            profitPerMile: contributionProfitPerMile,
            directTripCosts: directTripCosts,
            contributionProfit: contributionProfit,
            allocatedOperatingCosts: allocatedOperatingCosts,
            estimatedFullyLoadedOperatingProfit: estimatedFullyLoadedOperatingProfit,
            debtCashBurden: debtCashBurden,
            allocationBasisLabel: allocationBasisLabel
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

private struct CalculatorDefaultsDTO: Decodable {
    struct Thresholds: Decodable {
        let great: Double
        let good: Double
        let marginal: Double
    }

    let fuelPrice: Double?
    let mpg: Double?
    let dispatchPct: Double
    let factoringPct: Double
    let overheadPerMile: Double
    let trueCostPerMile: Double
    let basisLabel: String
    let basisMiles: Double
    let basisSufficient: Bool
    let targetProfitPerMile: Double
    let deadheadWarnPct: Double
    let thresholds: Thresholds

    func toDomain() -> CalculatorDefaults {
        CalculatorDefaults(
            fuelPrice: fuelPrice, mpg: mpg,
            dispatchPct: dispatchPct, factoringPct: factoringPct,
            overheadPerMile: overheadPerMile, trueCostPerMile: trueCostPerMile,
            basisLabel: basisLabel, basisMiles: basisMiles, basisSufficient: basisSufficient,
            targetProfitPerMile: targetProfitPerMile, deadheadWarnPct: deadheadWarnPct,
            thresholds: RatingThresholds(
                great: thresholds.great, good: thresholds.good, marginal: thresholds.marginal
            )
        )
    }
}

private struct AnalyticsResponseDTO: Decodable {
    struct Lane: Decodable {
        let key: String
        let label: String
        let loadCount: Int
        let revenue: Double
        let profitPerMile: Double
        let deadheadPct: Double
        let rating: String
        let loadsNeeded: Int?
    }

    struct Broker: Decodable {
        let broker: String
        let loadCount: Int
        let revenue: Double
        let profitPerMile: Double
        let deadheadPct: Double
        let outstanding: Double
        let rating: String
    }

    let periodLabel: String
    let minLoads: Int
    let qualifiedCount: Int
    let best: [Lane]
    let worst: [Lane]
    let emerging: [Lane]
    let brokers: [Broker]

    private func lane(_ row: Lane) -> LanePerformance {
        LanePerformance(
            id: row.key, label: row.label, loadCount: row.loadCount, revenue: row.revenue,
            profitPerMile: row.profitPerMile, deadheadPct: row.deadheadPct,
            rating: LoadRating(rawValue: row.rating) ?? .marginal,
            loadsNeeded: row.loadsNeeded
        )
    }

    func toDomain() -> AnalyticsSnapshot {
        AnalyticsSnapshot(
            periodLabel: periodLabel,
            minLoads: minLoads,
            qualifiedCount: qualifiedCount,
            best: best.map(lane),
            worst: worst.map(lane),
            emerging: emerging.map(lane),
            brokers: brokers.map { row in
                BrokerPerformance(
                    broker: row.broker, loadCount: row.loadCount, revenue: row.revenue,
                    profitPerMile: row.profitPerMile, deadheadPct: row.deadheadPct,
                    outstanding: row.outstanding,
                    rating: LoadRating(rawValue: row.rating) ?? .marginal
                )
            }
        )
    }
}

private struct IftaResponseDTO: Decodable {
    struct Jurisdiction: Decodable {
        let jurisdiction: String
        let totalMiles: Double
        let taxableMiles: Double
        let taxPaidGallons: Double
        let netTaxableGallons: Double
        let taxRate: Double?
        let taxDue: Double?
    }

    let quarter: String
    let start: String
    let end: String
    let complete: Bool
    let totalFleetMiles: Double
    let assignedMiles: Double
    let unassignedMiles: Double
    let totalGallons: Double
    let unassignedGallons: Double
    let fleetMpg: Double
    let missingRateJurisdictions: [String]
    let netTaxDue: Double?
    let jurisdictions: [Jurisdiction]
    // Per-truck IFTA filing scope -- added on the web in the same shape,
    // same route (`/api/mobile/ifta`), same day. See `IftaReport`.
    let filingScopeComplete: Bool
    let includedTruckCount: Int
    let pendingTruckCount: Int

    func toDomain() -> IftaReport {
        IftaReport(
            quarter: quarter,
            start: ISODate.parse(start),
            end: ISODate.parse(end),
            complete: complete,
            totalFleetMiles: totalFleetMiles,
            assignedMiles: assignedMiles,
            unassignedMiles: unassignedMiles,
            totalGallons: totalGallons,
            unassignedGallons: unassignedGallons,
            fleetMpg: fleetMpg,
            missingRateJurisdictions: missingRateJurisdictions,
            netTaxDue: netTaxDue,
            jurisdictions: jurisdictions.map {
                IftaJurisdiction(
                    jurisdiction: $0.jurisdiction, totalMiles: $0.totalMiles,
                    taxableMiles: $0.taxableMiles, taxPaidGallons: $0.taxPaidGallons,
                    netTaxableGallons: $0.netTaxableGallons, taxRate: $0.taxRate, taxDue: $0.taxDue
                )
            },
            filingScopeComplete: filingScopeComplete,
            includedTruckCount: includedTruckCount,
            pendingTruckCount: pendingTruckCount
        )
    }
}

private struct UpdateTruckIftaScopeDTO: Encodable {
    let truckId: String
    let iftaReportingEnabled: Bool?

    // Swift's synthesized Encodable OMITS an optional key entirely when it's
    // nil; the server needs the key present with a JSON `null` to tell "no
    // decision yet" apart from "field not sent" (see `PATCH` in
    // `api/mobile/truck/route.ts`), so this encodes it explicitly.
    private enum CodingKeys: String, CodingKey {
        case truckId, iftaReportingEnabled
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(truckId, forKey: .truckId)
        if let iftaReportingEnabled {
            try container.encode(iftaReportingEnabled, forKey: .iftaReportingEnabled)
        } else {
            try container.encodeNil(forKey: .iftaReportingEnabled)
        }
    }
}

private struct TruckResponseDTO: Decodable {
    struct Truck: Decodable {
        let id: String
        let name: String
        let detail: String?
        let vin: String?
        let odometer: Int
        let iftaReportingEnabled: Bool?
    }

    struct Lifetime: Decodable {
        let revenue: Double
        let expenses: Double
        let profit: Double
        let miles: Double
        let costPerMile: Double
        let revenuePerMile: Double
        let profitPerMile: Double
        let loadCount: Int
    }

    struct Due: Decodable {
        let type: String
        let label: String
        let status: String
        let dueDate: String?
        let dueOdometer: Double?
        let milesRemaining: Double?
        let daysRemaining: Double?
    }

    let periodLabel: String
    let truck: Truck
    let truckCount: Int
    let lifetime: Lifetime
    let milesPerGallon: Double?
    let fuelCostPerMile: Double
    let due: [Due]

    func toDomain() -> TruckSummary {
        TruckSummary(
            periodLabel: periodLabel,
            id: truck.id,
            name: truck.name,
            detail: truck.detail,
            vin: truck.vin,
            odometer: truck.odometer,
            truckCount: truckCount,
            iftaReportingEnabled: truck.iftaReportingEnabled,
            revenue: lifetime.revenue,
            expenses: lifetime.expenses,
            profit: lifetime.profit,
            miles: lifetime.miles,
            costPerMile: lifetime.costPerMile,
            revenuePerMile: lifetime.revenuePerMile,
            profitPerMile: lifetime.profitPerMile,
            loadCount: lifetime.loadCount,
            milesPerGallon: milesPerGallon,
            fuelCostPerMile: fuelCostPerMile,
            due: due.map { item in
                MaintenanceDueItem(
                    id: item.type,
                    label: item.label,
                    status: DueStatus(rawValue: item.status) ?? .unscheduled,
                    dueDate: item.dueDate.map(ISODate.parse),
                    dueOdometer: item.dueOdometer.map { Int($0) },
                    milesRemaining: item.milesRemaining.map { Int($0) },
                    daysRemaining: item.daysRemaining.map { Int($0) }
                )
            }
        )
    }
}

private struct ReportsResponseDTO: Decodable {
    struct Report: Decodable {
        let id: String
        let label: String
        let description: String
    }
    let reports: [Report]
}

/// A report cell is a string or a number on the wire, because that is what the
/// CSV and XLSX renderers need. The phone only ever prints it.
private struct ReportCell: Decodable {
    let text: String

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(String.self) {
            text = value
        } else if let value = try? container.decode(Double.self) {
            text = value == value.rounded() && abs(value) < 1e15
                ? String(Int(value))
                : String(format: "%.2f", value)
        } else {
            text = ""
        }
    }
}

private struct ReportTableResponseDTO: Decodable {
    struct Table: Decodable {
        let title: String
        let columns: [String]
        let rows: [[ReportCell]]
    }
    let periodLabel: String
    let table: Table
}

private struct TeamMemberDTO: Decodable {
    let id: String
    let email: String
    let name: String?
    let role: String
    let joinedAt: String?
    let invitedAt: String?

    func toDomain() -> TeamMember {
        TeamMember(
            id: id, email: email, name: name,
            role: MemberRole(rawValue: role) ?? .viewer,
            joinedAt: ISODate.parseDateTime(joinedAt),
            invitedAt: ISODate.parseDateTime(invitedAt)
        )
    }
}

private struct TeamResponseDTO: Decodable {
    let canManage: Bool
    let members: [TeamMemberDTO]

    func toDomain() -> TeamRoster {
        TeamRoster(canManage: canManage, members: members.map { $0.toDomain() })
    }
}

private struct InviteMemberDTO: Encodable {
    let email: String
    let name: String?
    let role: String
}

private struct UpdateMemberRoleDTO: Encodable {
    let role: String
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
        let collectedAmount: Double?
        let balanceAmount: Double?
        let paymentEventCount: Int?
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
                    overdueDays: row.overdueDays,
                    collectedAmount: row.collectedAmount ?? 0,
                    balanceAmount: row.balanceAmount,
                    paymentEventCount: row.paymentEventCount ?? 0
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

private struct RecordPaymentDTO: Encodable {
    let intent = "payment"
    let date: String
    let amount: Double
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
    let operatingProfit: Double
    let reserveTotal: Double
    let safeToPay: Double
    let drifted: Bool
    let month: String?
    let half: String?
    let closable: Bool?

    func toDomain() -> SettlementPeriod {
        SettlementPeriod(
            id: id,
            label: label,
            status: status == "OPEN" ? .open : .closed,
            operatingProfit: operatingProfit,
            reserveContributions: reserveTotal,
            ownerDraw: safeToPay,
            month: month,
            half: half,
            closable: closable ?? false
        )
    }
}

/// `month` and `half` identify the window; `status` says which way.
private struct SettlementStatusDTO: Encodable {
    let month: String
    let half: String
    let status: String
}

private struct SettlementsResponseDTO: Decodable {
    let settlements: [SettlementDTO]
}

private struct DashboardDTO: Decodable {
    struct Today: Decodable {
        struct CashActivity: Decodable { let collectedRevenue: Double; let netCashActivity: Double }
        let bookedRevenue: Double
        let operatingProfit: Double
        let loadCount: Int
        let cashActivity: CashActivity
    }
    struct Category: Decodable { let category: String; let label: String; let amount: Double }
    struct Reserve: Decodable { let id: String; let name: String; let contributionPct: Double?; let balance: Double }

    let periodLabel: String
    let bookedRevenue: Double
    let operatingExpenses: Double
    let operatingProfit: Double
    let bookedRevenueDeltaPct: Double
    let operatingProfitDeltaPct: Double
    let actualCostPerMile: Double
    /// `null` when the plan or the role does not include owner planning.
    let safeToPay: Double?
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
            bookedRevenue: bookedRevenue,
            operatingExpenses: operatingExpenses,
            operatingProfit: operatingProfit,
            bookedRevenueDelta: delta(bookedRevenueDeltaPct),
            operatingProfitDelta: delta(operatingProfitDeltaPct),
            actualCostPerMile: actualCostPerMile,
            safeToPay: safeToPay,
            totalMiles: totalMiles,
            deadheadPct: deadheadPct / 100, // server sends 0...100
            todayBookedRevenue: today.bookedRevenue,
            todayOperatingProfit: today.operatingProfit,
            todayLoads: today.loadCount,
            todayCashCollected: today.cashActivity.collectedRevenue,
            todayNetCashActivity: today.cashActivity.netCashActivity,
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

/// `GET /api/mobile/loads/{id}` — the raw record, not the derived figures.
private struct LoadDetailResponseDTO: Decodable {
    let load: LoadDetailDTO
}

private struct LoadDetailDTO: Decodable {
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
    let fuelCost: Double
    let tolls: Double
    let otherExpenses: Double
    let status: String
    let invoiceNumber: String?

    func toDomain() -> LoadDetail {
        LoadDetail(
            id: id,
            date: ISODate.parse(date),
            broker: broker ?? "",
            originCity: originCity,
            originState: originState,
            destinationCity: destinationCity,
            destinationState: destinationState,
            grossRate: grossRate,
            loadedMiles: loadedMiles,
            deadheadMiles: deadheadMiles,
            fuelCost: fuelCost,
            tolls: tolls,
            otherExpenses: otherExpenses,
            status: status,
            invoiceNumber: invoiceNumber
        )
    }
}

/// Only the fields this screen shows. The server merges them onto the stored
/// load, so dispatch, factoring, equipment and IFTA miles are never blanked
/// by an edit made from a phone.
private struct LoadEditDTO: Encodable {
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
    let otherExpenses: Double

    init(_ change: LoadEdit) {
        date = ISODate.day(change.date)
        broker = change.broker.isEmpty ? nil : change.broker
        originCity = change.originCity
        originState = change.originState.uppercased()
        destinationCity = change.destinationCity
        destinationState = change.destinationState.uppercased()
        grossRate = change.grossRate
        loadedMiles = change.loadedMiles
        deadheadMiles = change.deadheadMiles
        fuelCost = change.fuelCost
        tolls = change.tolls
        otherExpenses = change.otherExpenses
    }
}

// MARK: - Fleet wire types

private struct DriversResponseDTO: Decodable {
    let drivers: [DriverDTO]
}

private struct DriverDTO: Decodable {
    let id: String
    let name: String
    let active: Bool
    let payType: String
    let payRate: Double
    let reference: String?
    let defaultTruckId: String?

    func toDomain() -> DriverRecord {
        DriverRecord(
            id: id, name: name, active: active, payType: payType,
            payRate: payRate, reference: reference, defaultTruckId: defaultTruckId
        )
    }
}

/// Exactly what `driverSchema` wants. No email, no phone, nothing that could
/// be mistaken for a sign-in.
private struct NewDriverDTO: Encodable {
    let name: String
    let payType: String
    let payRate: Double
    let reference: String?
    let defaultTruckId: String?
    let active: Bool

    init(_ driver: NewDriver) {
        name = driver.name
        payType = driver.payType
        payRate = driver.payRate
        reference = driver.reference
        defaultTruckId = driver.defaultTruckId
        active = driver.active
    }
}

/// A retire/restore is its own small write, not a full driver replace.
private struct DriverActiveDTO: Encodable {
    let active: Bool
}

private struct FleetResponseDTO: Decodable {
    struct Unit: Decodable {
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

    let periodLabel: String
    let revenue: Double
    let directCosts: Double
    let contribution: Double
    let overhead: Double
    let operatingProfit: Double
    let totalMiles: Double
    let overheadPerMile: Double
    let units: [Unit]

    func toDomain() -> FleetOverview {
        FleetOverview(
            periodLabel: periodLabel,
            revenue: revenue,
            directCosts: directCosts,
            contribution: contribution,
            overhead: overhead,
            operatingProfit: operatingProfit,
            totalMiles: totalMiles,
            overheadPerMile: overheadPerMile,
            units: units.map {
                FleetUnit(
                    truckId: $0.truckId, truckName: $0.truckName, active: $0.active,
                    loadCount: $0.loadCount, revenue: $0.revenue, directCosts: $0.directCosts,
                    contribution: $0.contribution, totalMiles: $0.totalMiles,
                    deadheadPct: $0.deadheadPct, revenuePerMile: $0.revenuePerMile,
                    contributionPerMile: $0.contributionPerMile,
                    actualCostPerMile: $0.actualCostPerMile
                )
            }
        )
    }
}

private struct DriverStatementsResponseDTO: Decodable {
    let statements: [DriverStatementDTO]
}

private struct DriverStatementDTO: Decodable {
    let id: String
    let driverName: String
    let periodStart: String
    let periodEnd: String
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

    func toDomain() -> DriverStatement {
        DriverStatement(
            id: id, driverName: driverName, periodStart: periodStart, periodEnd: periodEnd,
            status: status, paidOn: paidOn, loads: loads, grossRevenue: grossRevenue,
            totalMiles: totalMiles, basePay: basePay, additions: additions,
            deductions: deductions, advances: advances, netPay: netPay
        )
    }
}
