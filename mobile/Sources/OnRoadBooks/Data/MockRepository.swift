import Foundation

/// Sample data for design/navigation review before `APIRepository` is
/// wired up. Seeded with OnRoad Books' own real August-2026 demo figures
/// (see project memory `truckledger.md` / `onroadbooks_landing.md`) so the
/// app reads with credible numbers instead of Lorem Ipsum:
///
///   booked revenue $9,795.00 − operating expenses $6,143.90 = operating profit $3,651.10
///   actual cost/mile $1.84 · reserves (tax 20% of profit, maintenance 5% of
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

    func fetchCalculatorDefaults() async throws -> CalculatorDefaults {
        CalculatorDefaults(
            fuelPrice: 4.465, mpg: 7.0, dispatchPct: 10, factoringPct: 3,
            overheadPerMile: 0.94, trueCostPerMile: 1.84,
            basisLabel: "últimos 90 días", basisMiles: 3339, basisSufficient: true,
            targetProfitPerMile: 0.75, deadheadWarnPct: 20,
            thresholds: RatingThresholds(great: 1.25, good: 0.75, marginal: 0.25)
        )
    }

    func fetchAnalytics() async throws -> AnalyticsSnapshot {
        AnalyticsSnapshot(
            periodLabel: "August 2026 · Full Month",
            minLoads: 3,
            qualifiedCount: 1,
            best: [
                LanePerformance(id: "IL-OH", label: "IL → OH", loadCount: 3, revenue: 6420,
                                profitPerMile: 1.84, deadheadPct: 4.2, rating: .great, loadsNeeded: nil),
            ],
            worst: [],
            emerging: [
                LanePerformance(id: "AZ-NM", label: "AZ → NM", loadCount: 1, revenue: 980,
                                profitPerMile: 0.31, deadheadPct: 31.1, rating: .bad, loadsNeeded: 2),
                LanePerformance(id: "TX-TN", label: "TX → TN", loadCount: 2, revenue: 1640,
                                profitPerMile: 1.42, deadheadPct: 7.8, rating: .good, loadsNeeded: 1),
            ],
            brokers: [
                BrokerPerformance(broker: "Werner Logistics", loadCount: 3, revenue: 6420,
                                  profitPerMile: 1.84, deadheadPct: 4.2, outstanding: 2850, rating: .great),
                BrokerPerformance(broker: "TQL", loadCount: 2, revenue: 1640,
                                  profitPerMile: 1.42, deadheadPct: 7.8, outstanding: 1640, rating: .good),
                BrokerPerformance(broker: "Landstar", loadCount: 1, revenue: 640,
                                  profitPerMile: 0.98, deadheadPct: 28.3, outstanding: 0, rating: .marginal),
            ]
        )
    }

    func fetchIfta(quarter: String?) async throws -> IftaReport {
        // Deliberately incomplete: 210 miles unassigned and NM with no rate, so
        // demo mode shows the refusal rather than a number that looks filable.
        IftaReport(
            quarter: quarter ?? "2026-Q3",
            start: mockDate(2026, 7, 1),
            end: mockDate(2026, 9, 30),
            complete: false,
            totalFleetMiles: 3339,
            assignedMiles: 3129,
            unassignedMiles: 210,
            totalGallons: 478.4,
            unassignedGallons: 30.1,
            fleetMpg: 6.98,
            missingRateJurisdictions: ["NM"],
            netTaxDue: nil,
            jurisdictions: [
                IftaJurisdiction(jurisdiction: "TX", totalMiles: 1240, taxableMiles: 1240,
                                 taxPaidGallons: 186.2, netTaxableGallons: -8.6, taxRate: 0.20, taxDue: -1.72),
                IftaJurisdiction(jurisdiction: "OH", totalMiles: 980, taxableMiles: 980,
                                 taxPaidGallons: 92.4, netTaxableGallons: 48.0, taxRate: 0.47, taxDue: 22.56),
                IftaJurisdiction(jurisdiction: "NM", totalMiles: 465, taxableMiles: 465,
                                 taxPaidGallons: 0, netTaxableGallons: 66.6, taxRate: nil, taxDue: nil),
            ]
        )
    }

    func fetchTruck() async throws -> TruckSummary {
        // The same August demo figures as everywhere else: $9,795 in, $6,143.90
        // out, 3,339 miles. Change one, check the others still add up.
        TruckSummary(
            periodLabel: "August 2026 · Full Month",
            name: "Unit 1",
            detail: "2021 Freightliner Cascadia",
            vin: nil,
            odometer: 268_412,
            truckCount: 1,
            revenue: 9795.00,
            expenses: 6143.90,
            profit: 3651.10,
            miles: 3339,
            costPerMile: 1.84,
            revenuePerMile: 2.93,
            profitPerMile: 1.09,
            loadCount: 5,
            milesPerGallon: 7.0,
            fuelCostPerMile: 0.40,
            due: [
                MaintenanceDueItem(id: "OIL_CHANGE", label: "Oil change", status: .dueSoon,
                                   dueDate: mockDate(2026, 9, 20), dueOdometer: 273_000,
                                   milesRemaining: 4588, daysRemaining: 19),
                MaintenanceDueItem(id: "DOT_INSPECTION", label: "DOT inspection", status: .ok,
                                   dueDate: mockDate(2027, 5, 12), dueOdometer: nil,
                                   milesRemaining: nil, daysRemaining: 253),
            ]
        )
    }

    func fetchReports() async throws -> [ReportSummary] {
        [
            ReportSummary(id: "loads", label: "Loads Report", description: "Every load with its full profitability stack"),
            ReportSummary(id: "expenses", label: "Expense Report", description: "Ledger detail with fixed / variable split"),
            ReportSummary(id: "fuel", label: "Fuel Report", description: "Fill-ups, gallons, price and odometer"),
            ReportSummary(id: "profit-loss", label: "Profit & Loss Summary", description: "Revenue, costs by category, reserves"),
        ]
    }

    func fetchReportTable(_ reportId: String) async throws -> ReportTable {
        ReportTable(
            title: "Loads — August 2026",
            columns: ["Date", "Lane", "Broker", "Rate", "Miles", "Profit/mi"],
            rows: [
                ["2026-08-28", "Chicago, IL → Columbus, OH", "Werner Logistics", "2850.00", "368", "1.98"],
                ["2026-08-25", "Dallas, TX → Memphis, TN", "TQL", "1640.00", "490", "1.42"],
                ["2026-08-22", "Atlanta, GA → Charlotte, NC", "Coyote", "980.00", "264", "1.35"],
            ]
        )
    }

    func downloadReport(_ reportId: String, format: String) async throws -> URL {
        throw APIError.refused("Los exports necesitan una cuenta real. Entra con tu cuenta para descargarlos.")
    }

    func downloadYearEndPacket(year: Int) async throws -> URL {
        throw APIError.refused("El paquete de fin de año necesita una cuenta real.")
    }

    func fetchReserves() async throws -> ReserveLedger {
        // The same three buckets and the same arithmetic as fetchDashboard:
        // tax 20% of profit, maintenance 5% of revenue, emergency 2% of revenue.
        ReserveLedger(
            periodLabel: "August 2026 · Full Month",
            total: 4469.61,
            periodContributions: 1415.87,
            periodWithdrawals: 0,
            safeToPay: 2235.23,
            accounts: [
                ReserveBucket(id: "tax", name: "Tax", balance: 2412.66,
                              periodContributions: 730.22, periodWithdrawals: 0,
                              targetBalance: 6000, targetProgress: 40.2,
                              rulePct: 20, ruleBasis: "OPERATING_PROFIT"),
                ReserveBucket(id: "maint", name: "Maintenance", balance: 1469.25,
                              periodContributions: 489.75, periodWithdrawals: 0,
                              targetBalance: 3000, targetProgress: 48.9,
                              rulePct: 5, ruleBasis: "GROSS_REVENUE"),
                ReserveBucket(id: "emerg", name: "Emergency", balance: 587.70,
                              periodContributions: 195.90, periodWithdrawals: 0,
                              targetBalance: nil, targetProgress: nil,
                              rulePct: 2, ruleBasis: "GROSS_REVENUE"),
            ],
            movements: [
                ReserveMovement(id: "m1", accountName: "Tax", date: mockDate(2026, 8, 16),
                                amount: 370.11, detail: "Cierre Ago 1 – 15", automatic: true),
                ReserveMovement(id: "m2", accountName: "Maintenance", date: mockDate(2026, 8, 16),
                                amount: 244.88, detail: "Cierre Ago 1 – 15", automatic: true),
                ReserveMovement(id: "m3", accountName: "Emergency", date: mockDate(2026, 8, 16),
                                amount: 97.95, detail: "Cierre Ago 1 – 15", automatic: true),
                ReserveMovement(id: "m4", accountName: "Maintenance", date: mockDate(2026, 8, 12),
                                amount: -340.00, detail: "Cambio de aceite + inspección DOT", automatic: false),
            ]
        )
    }

    func fetchInvoices() async throws -> InvoiceLedger {
        let outstanding = invoices.filter { $0.isIssued && $0.status == .invoiced }
        let overdue = outstanding.filter(\.isOverdue)
        let paid = invoices.filter { $0.isIssued && $0.status == .paid }
        let outstandingTotal = { (list: [Invoice]) in list.reduce(0) { $0 + $1.outstandingAmount } }
        let collectedTotal = { (list: [Invoice]) in
            list.reduce(0) { total, invoice in
                total + (invoice.collectedAmount > 0 ? invoice.collectedAmount : invoice.amount)
            }
        }

        return InvoiceLedger(
            today: mockDate(2026, 9, 1),
            suggestedNumber: "INV-2026-0043",
            summary: InvoiceSummary(
                outstandingAmount: outstandingTotal(outstanding), outstandingCount: outstanding.count,
                overdueAmount: outstandingTotal(overdue), overdueCount: overdue.count,
                collectedAmount: collectedTotal(paid), collectedCount: paid.count,
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
            overdueDays: nil,
            collectedAmount: existing.collectedAmount,
            balanceAmount: existing.balanceAmount,
            paymentEventCount: existing.paymentEventCount
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
            invoiceDate: existing.invoiceDate, dueDate: existing.dueDate, overdueDays: nil,
            collectedAmount: existing.amount, balanceAmount: 0,
            paymentEventCount: existing.paymentEventCount + 1
        )
        return loadId
    }

    @discardableResult
    func recordInvoicePayment(loadId: String, amount: Double, on date: Date) async throws -> String {
        guard let index = invoices.firstIndex(where: { $0.loadId == loadId }) else { return loadId }
        let existing = invoices[index]
        let currentBalance = existing.outstandingAmount
        guard amount > 0, amount <= currentBalance else {
            throw APIError.refused("El pago debe ser mayor que cero y no puede exceder el saldo.")
        }
        let collected = existing.collectedAmount + amount
        let balance = max(0, currentBalance - amount)
        invoices[index] = Invoice(
            loadId: existing.loadId, invoiceNumber: existing.invoiceNumber,
            loadNumber: existing.loadNumber, customer: existing.customer, lane: existing.lane,
            amount: existing.amount, status: balance == 0 ? .paid : .invoiced, date: existing.date,
            invoiceDate: existing.invoiceDate, dueDate: existing.dueDate,
            overdueDays: balance == 0 ? nil : existing.overdueDays,
            collectedAmount: collected, balanceAmount: balance,
            paymentEventCount: existing.paymentEventCount + 1
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
            SettlementPeriod(id: "s-aug-16", label: "Aug 16 – 31", status: .open, operatingProfit: 1802.40, reserveContributions: 0, ownerDraw: 0),
            SettlementPeriod(id: "s-aug-01", label: "Aug 1 – 15", status: .closed, operatingProfit: 1848.70, reserveContributions: 703.10, ownerDraw: 1145.60),
            SettlementPeriod(id: "s-jul-16", label: "Jul 16 – 31", status: .closed, operatingProfit: 1710.05, reserveContributions: 649.90, ownerDraw: 1060.15),
            SettlementPeriod(id: "s-jul-01", label: "Jul 1 – 15", status: .closed, operatingProfit: 1594.30, reserveContributions: 606.20, ownerDraw: 988.10),
        ]
    }

    func fetchDashboard() async throws -> DashboardSnapshot {
        let bookedRevenue = 9795.00
        let operatingExpenses = 4859.82
        let operatingProfit = bookedRevenue - operatingExpenses

        let breakdown: [CategoryTotal] = [
            .init(id: "FUEL", label: "Fuel", amount: 1320.94),
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
            bookedRevenue: bookedRevenue,
            operatingExpenses: operatingExpenses,
            operatingProfit: operatingProfit,
            bookedRevenueDelta: ("+8.4% vs Jul", .up),
            operatingProfitDelta: ("+12.1% vs Jul", .up),
            actualCostPerMile: 1.84,
            safeToPay: 2235.23,
            totalMiles: 3339,
            deadheadPct: 0.265,
            todayBookedRevenue: 420,
            todayOperatingProfit: 285,
            todayLoads: 1,
            todayCashCollected: 900,
            todayNetCashActivity: 615,
            expenseBreakdown: breakdown,
            recentLoads: loads,
            reserves: reserves
        )
    }
}
