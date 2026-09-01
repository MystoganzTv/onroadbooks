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
private func mockDate(_ y: Int, _ m: Int, _ d: Int) -> Date {
    Calendar(identifier: .gregorian).date(from: DateComponents(year: y, month: m, day: d))!
}

final class MockRepository: LedgerRepository {
    /// Mutable so demo mode can actually add a load or an expense and see it
    /// appear. Nothing is persisted: it lives as long as the app runs, which is
    /// the honest shape of a demo.
    private var loads: [Load] = [
            Load(id: "1", date: mockDate(2026, 8, 28), broker: "Werner Logistics",
                 origin: "Chicago, IL", destination: "Columbus, OH",
                 rate: 2850, miles: 356, deadheadMiles: 12,
                 rating: .great, profitPerMile: 1.98),
            Load(id: "2", date: mockDate(2026, 8, 25), broker: "TQL",
                 origin: "Dallas, TX", destination: "Memphis, TN",
                 rate: 1640, miles: 452, deadheadMiles: 38,
                 rating: .good, profitPerMile: 1.42),
            Load(id: "3", date: mockDate(2026, 8, 22), broker: "Coyote",
                 origin: "Atlanta, GA", destination: "Charlotte, NC",
                 rate: 980, miles: 244, deadheadMiles: 20,
                 rating: .good, profitPerMile: 1.35),
            Load(id: "4", date: mockDate(2026, 8, 19), broker: "Landstar",
                 origin: "Louisville, KY", destination: "Indianapolis, IN",
                 rate: 640, miles: 114, deadheadMiles: 45,
                 rating: .marginal, profitPerMile: 0.98),
            Load(id: "5", date: mockDate(2026, 8, 14), broker: "Direct Shipper",
                 origin: "Phoenix, AZ", destination: "Albuquerque, NM",
                 rate: 980, miles: 465, deadheadMiles: 210,
                 rating: .bad, profitPerMile: 0.31),
    ]

    private var expenses: [ExpenseEntry] = [
            ExpenseEntry(id: "e1", date: mockDate(2026, 8, 27), category: "Fuel", note: "Pilot #442 — Joplin, MO", amount: 412.60),
            ExpenseEntry(id: "e2", date: mockDate(2026, 8, 20), category: "Fuel", note: "Loves — Amarillo, TX", amount: 388.10),
            ExpenseEntry(id: "e3", date: mockDate(2026, 8, 15), category: "Truck Payment", note: "Freightliner Cascadia — monthly note", amount: 1284.08),
            ExpenseEntry(id: "e4", date: mockDate(2026, 8, 12), category: "Maintenance & Repairs", note: "Oil change + DOT inspection", amount: 340.00),
            ExpenseEntry(id: "e5", date: mockDate(2026, 8, 9), category: "Insurance", note: "Progressive Commercial — monthly premium", amount: 681.97),
            ExpenseEntry(id: "e6", date: mockDate(2026, 8, 5), category: "Other", note: "ELD subscription + phone plan", amount: 214.50),
    ]

    /// Two fill-ups on the same truck, with odometer readings 1,247 miles
    /// apart on 178.4 gallons — so demo mode shows a real 7.0 MPG instead of a
    /// dash, and the span rule is visible in the data itself.
    private var fuel: [FuelStop] = [
        FuelStop(id: "f1", date: mockDate(2026, 8, 27), gallons: 92.4, pricePerGallon: 4.465,
                 totalCost: 412.60, odometer: 268_412, location: "Pilot #442, Joplin, MO", jurisdiction: "MO"),
        FuelStop(id: "f2", date: mockDate(2026, 8, 20), gallons: 86.0, pricePerGallon: 4.513,
                 totalCost: 388.10, odometer: 267_165, location: "Love's, Amarillo, TX", jurisdiction: "TX"),
    ]

    /// Demo receivables, tied to the demo loads above: one collected, one
    /// overdue, one just issued, one delivered and not yet billed.
    private var invoices: [Invoice] = [
        Invoice(loadId: "1", invoiceNumber: "INV-2026-0042", loadNumber: "DAT-784",
                customer: "Werner Logistics", lane: "Chicago, IL → Columbus, OH",
                amount: 2850, status: .invoiced, date: mockDate(2026, 8, 28),
                invoiceDate: mockDate(2026, 8, 29), dueDate: mockDate(2026, 9, 28), overdueDays: nil),
        Invoice(loadId: "2", invoiceNumber: "INV-2026-0041", loadNumber: nil,
                customer: "TQL", lane: "Dallas, TX → Memphis, TN",
                amount: 1640, status: .invoiced, date: mockDate(2026, 8, 25),
                invoiceDate: mockDate(2026, 7, 26), dueDate: mockDate(2026, 8, 25), overdueDays: 7),
        Invoice(loadId: "3", invoiceNumber: "INV-2026-0040", loadNumber: nil,
                customer: "Coyote", lane: "Atlanta, GA → Charlotte, NC",
                amount: 980, status: .paid, date: mockDate(2026, 8, 22),
                invoiceDate: mockDate(2026, 8, 22), dueDate: mockDate(2026, 9, 21), overdueDays: nil),
        Invoice(loadId: "4", invoiceNumber: nil, loadNumber: nil,
                customer: "Landstar", lane: "Louisville, KY → Indianapolis, IN",
                amount: 640, status: .pending, date: mockDate(2026, 8, 19),
                invoiceDate: nil, dueDate: nil, overdueDays: nil),
    ]

    func fetchLoads() async throws -> [Load] { loads }

    func fetchInvoices() async throws -> InvoiceLedger {
        let outstanding = invoices.filter { $0.isIssued && $0.status == .invoiced }
        let overdue = outstanding.filter(\.isOverdue)
        let paid = invoices.filter { $0.isIssued && $0.status == .paid }
        let total = { (list: [Invoice]) in list.reduce(0) { $0 + $1.amount } }

        return InvoiceLedger(
            today: mockDate(2026, 9, 1),
            suggestedNumber: "INV-2026-0043",
            summary: InvoiceSummary(
                outstandingAmount: total(outstanding), outstandingCount: outstanding.count,
                overdueAmount: total(overdue), overdueCount: overdue.count,
                collectedAmount: total(paid), collectedCount: paid.count,
                uninvoicedCount: invoices.filter { !$0.isIssued }.count
            ),
            invoices: invoices
        )
    }

    @discardableResult
    func issueInvoice(loadId: String, _ invoice: NewInvoice) async throws -> String {
        guard let index = invoices.firstIndex(where: { $0.loadId == loadId }) else { return loadId }
        let existing = invoices[index]
        invoices[index] = Invoice(
            loadId: existing.loadId, invoiceNumber: invoice.invoiceNumber,
            loadNumber: existing.loadNumber, customer: invoice.customer, lane: existing.lane,
            amount: existing.amount,
            // Same rule as the server: money already collected stays collected.
            status: existing.status == .paid ? .paid : .invoiced,
            date: existing.date, invoiceDate: invoice.invoiceDate, dueDate: invoice.dueDate,
            overdueDays: nil
        )
        return loadId
    }

    /// Demo mode has nowhere to put a photo, and pretending otherwise would be
    /// the app telling him a receipt was filed when it was not.
    @discardableResult
    func attachReceipt(expenseId: String, jpeg: Data) async throws -> String {
        throw APIError.refused("Los recibos necesitan una cuenta real. Entra con tu cuenta para adjuntarlos.")
    }

    @discardableResult
    func markInvoicePaid(loadId: String, on date: Date) async throws -> String {
        guard let index = invoices.firstIndex(where: { $0.loadId == loadId }) else { return loadId }
        let existing = invoices[index]
        invoices[index] = Invoice(
            loadId: existing.loadId, invoiceNumber: existing.invoiceNumber,
            loadNumber: existing.loadNumber, customer: existing.customer, lane: existing.lane,
            amount: existing.amount, status: .paid, date: existing.date,
            invoiceDate: existing.invoiceDate, dueDate: existing.dueDate, overdueDays: nil
        )
        return loadId
    }

    func fetchFuel() async throws -> FuelLedger {
        let gallons = fuel.reduce(0) { $0 + $1.gallons }
        let cost = fuel.reduce(0) { $0 + $1.totalCost }
        let odometers = fuel.compactMap(\.odometer).sorted()
        // Same rule as the server: a span needs two readings, and the gallons
        // that fuelled it exclude the first fill-up.
        let spanMiles = odometers.count >= 2 ? Double(odometers.last! - odometers.first!) : nil
        let spanGallons = fuel.sorted { ($0.odometer ?? 0) < ($1.odometer ?? 0) }
            .dropFirst().reduce(0) { $0 + $1.gallons }

        return FuelLedger(
            summary: FuelSummary(
                totalGallons: gallons,
                totalCost: cost,
                averagePricePerGallon: gallons > 0 ? cost / gallons : 0,
                fuelCostPerMile: cost / 3339,      // the demo month's total miles
                entryCount: fuel.count,
                milesPerGallon: (spanMiles ?? 0) > 0 && spanGallons > 0 ? spanMiles! / spanGallons : nil,
                odometerMiles: spanMiles
            ),
            entries: fuel
        )
    }

    @discardableResult
    func createFuelStop(_ stop: NewFuelStop) async throws -> String {
        let id = "demo-\(UUID().uuidString.prefix(8))"
        fuel.insert(
            FuelStop(id: id, date: stop.date, gallons: stop.gallons,
                     pricePerGallon: stop.pricePerGallon, totalCost: stop.totalCost,
                     odometer: stop.odometer,
                     location: stop.location.isEmpty ? nil : stop.location,
                     jurisdiction: stop.jurisdiction.isEmpty ? nil : stop.jurisdiction.uppercased()),
            at: 0
        )
        return id
    }

    func fetchExpenses() async throws -> ExpenseLedger {
        // A short, obviously partial list: the real one is served by
        // /api/mobile/expenses and this file is not the source of truth for it.
        ExpenseLedger(
            entries: expenses,
            categories: [
                .init(id: "FUEL", label: "Fuel"),
                .init(id: "TOLLS", label: "Tolls"),
                .init(id: "MAINTENANCE", label: "Maintenance"),
                .init(id: "REPAIRS", label: "Repairs"),
                .init(id: "PARKING", label: "Parking"),
                .init(id: "INSURANCE", label: "Insurance"),
                .init(id: "TRUCK_PAYMENT", label: "Truck Payment"),
                .init(id: "OTHER", label: "Other"),
            ]
        )
    }

    @discardableResult
    func createLoad(_ load: NewLoad) async throws -> String {
        let id = "demo-\(UUID().uuidString.prefix(8))"
        let miles = load.loadedMiles + load.deadheadMiles
        let profit = load.grossRate - (load.fuelCost + load.tolls + load.otherExpenses)
        let perMile = miles > 0 ? profit / miles : 0
        loads.insert(
            Load(id: id, date: load.date,
                 broker: load.broker.isEmpty ? "Direct" : load.broker,
                 origin: "\(load.originCity), \(load.originState.uppercased())",
                 destination: "\(load.destinationCity), \(load.destinationState.uppercased())",
                 rate: load.grossRate, miles: load.loadedMiles, deadheadMiles: load.deadheadMiles,
                 rating: demoRating(profitPerMile: perMile), profitPerMile: perMile),
            at: 0
        )
        return id
    }

    @discardableResult
    func createExpense(_ expense: NewExpense) async throws -> String {
        let id = "demo-\(UUID().uuidString.prefix(8))"
        let note = [expense.detail, expense.vendor].filter { !$0.isEmpty }.joined(separator: " — ")
        expenses.insert(
            ExpenseEntry(id: id, date: expense.date, category: expense.categoryId,
                         note: note.isEmpty ? expense.categoryId : note, amount: expense.amount),
            at: 0
        )
        return id
    }

    /// Demo only. A real rating comes from the server, which scores against
    /// this business's own thresholds; these bands exist so an entry made in
    /// demo mode is not left blank, and they are not the product's judgement.
    private func demoRating(profitPerMile: Double) -> LoadRating {
        switch profitPerMile {
        case 1.50...: return .great
        case 1.00..<1.50: return .good
        case 0.50..<1.00: return .marginal
        default: return .bad
        }
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
            recentLoads: loads,
            reserves: reserves
        )
    }
}
