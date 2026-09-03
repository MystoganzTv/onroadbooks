import SwiftUI
import UIKit

/// "What rate should I ask? Is this load worth it?" — the two questions the web
/// app's Load Calculator answers.
///
/// Every cost assumption comes from THIS truck's ledger, fetched on open: its
/// own MPG, the price it last paid for diesel, the dispatch and factoring
/// percentages it actually pays, and its overhead per mile. It used to ship
/// hardcoded guesses — 6.5 MPG, $3.85 diesel, $0.85/mi — which produced a
/// confident verdict about somebody else's truck, at the exact moment a broker
/// is waiting on the phone for an answer.
///
/// Nothing is assumed when nothing is known: an unproved MPG leaves the field
/// empty and the calculator says it cannot cost the load, and an overhead not
/// backed by enough recorded miles is labelled as such rather than used quietly.
struct LoadCalculatorView: View {
    private enum RateContext: String, CaseIterable, Identifiable {
        case brokerOffer
        case noOffer

        var id: String { rawValue }
        var label: String {
            switch self {
            case .brokerOffer: return "Tengo oferta"
            case .noOffer: return "Sin oferta"
            }
        }
    }

    let repository: LedgerRepository

    @State private var defaults: CalculatorDefaults?
    @State private var isLoading = true
    @State private var refusal: String?
    @State private var rateContext: RateContext = .brokerOffer

    /// Every input is held as TEXT, exactly like Add Load, Add Fuel and Add
    /// Expense do through `OBNumberRow`. A `TextField(value:format:)` bound
    /// straight to a Double fights the decimal pad: the leading zero cannot be
    /// cleared, a half-typed "3." does not parse so the keystroke is reverted,
    /// and nothing commits until the field loses focus -- which on a decimal
    /// pad, with no Done key, may never happen. That is what made this screen
    /// refuse to take new numbers.
    @State private var grossRateText = ""
    @State private var loadedMilesText = ""
    @State private var deadheadMilesText = ""
    @State private var fuelPriceText = ""
    @State private var mpgText = ""
    @State private var tollsText = ""
    @State private var dispatchMode: FeeMode = .percent
    @State private var dispatchValueText = ""
    @State private var factoringMode: FeeMode = .percent
    @State private var factoringValueText = ""
    @State private var otherCostText = ""
    @State private var overheadPerMileText = ""
    @State private var targetProfitPerMileText = ""

    private var grossRate: Double { OBNumber.parse(grossRateText) ?? 0 }
    private var loadedMiles: Double { OBNumber.parse(loadedMilesText) ?? 0 }
    private var deadheadMiles: Double { OBNumber.parse(deadheadMilesText) ?? 0 }
    private var fuelPrice: Double { OBNumber.parse(fuelPriceText) ?? 0 }
    private var mpg: Double { OBNumber.parse(mpgText) ?? 0 }
    private var tolls: Double { OBNumber.parse(tollsText) ?? 0 }
    private var dispatchValue: Double { OBNumber.parse(dispatchValueText) ?? 0 }
    private var factoringValue: Double { OBNumber.parse(factoringValueText) ?? 0 }
    private var otherCost: Double { OBNumber.parse(otherCostText) ?? 0 }
    private var overheadPerMile: Double { OBNumber.parse(overheadPerMileText) ?? 0 }
    private var targetProfitPerMile: Double { OBNumber.parse(targetProfitPerMileText) ?? 0 }

    /// Seeded values go in as text a person would have typed: no trailing
    /// zeros, and an empty field rather than a "0" that has to be deleted.
    private static func seedText(_ value: Double?) -> String {
        guard let value, value != 0 else { return "" }
        if value == value.rounded() { return String(Int(value)) }
        var text = String(format: "%.4f", value)
        while text.contains(".") && (text.hasSuffix("0") || text.hasSuffix(".")) {
            text.removeLast()
        }
        return text
    }

    private var thresholds: RatingThresholds {
        defaults?.thresholds ?? RatingThresholds(great: 1.25, good: 0.75, marginal: 0.25)
    }

    private var estimate: LoadEstimate {
        LoadCalculatorMath.evaluate(
            grossRate: grossRate, loadedMiles: loadedMiles, deadheadMiles: deadheadMiles,
            fuelPrice: fuelPrice, mpg: mpg, tolls: tolls,
            dispatchMode: dispatchMode, dispatchValue: dispatchValue,
            factoringMode: factoringMode, factoringValue: factoringValue,
            otherCost: otherCost, overheadPerMile: overheadPerMile,
            debtServicePerMile: defaults?.debtServicePerMile ?? 0,
            thresholds: thresholds
        )
    }

    private var rates: TargetRates {
        LoadCalculatorMath.targetRate(
            loadedMiles: loadedMiles, deadheadMiles: deadheadMiles,
            fuelPrice: fuelPrice, mpg: mpg, tolls: tolls,
            dispatchMode: dispatchMode, dispatchValue: dispatchValue,
            factoringMode: factoringMode, factoringValue: factoringValue,
            otherCost: otherCost, overheadPerMile: overheadPerMile,
            debtServicePerMile: defaults?.debtServicePerMile ?? 0,
            thresholds: thresholds,
            targetProfitPerMile: targetProfitPerMile
        )
    }

    private var offerComparison: OfferComparison? {
        rateContext == .brokerOffer && grossRate > 0
            ? LoadCalculatorMath.compareOffer(grossRate, rates: rates)
            : nil
    }

    var body: some View {
        Group {
            if isLoading {
                ProgressView().tint(OBColor.primary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let refusal {
                VStack(spacing: OBSpacing.sm) {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 30))
                        .foregroundStyle(OBColor.mutedForeground)
                    Text(refusal)
                        .font(.subheadline)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(OBColor.mutedForeground)
                        .padding(.horizontal, OBSpacing.lg)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: OBSpacing.lg) {
                        if rateContext == .brokerOffer && grossRate > 0 && estimate.valid {
                            resultCard
                        }
                        inputsCard
                        targetCard
                    }
                    .padding(.vertical, OBSpacing.md)
                }
                .scrollDismissesKeyboard(.interactively)
                .toolbar {
                    ToolbarItemGroup(placement: .keyboard) {
                        Spacer()
                        Button("Listo") {
                            UIApplication.shared.sendAction(
                                #selector(UIResponder.resignFirstResponder),
                                to: nil, from: nil, for: nil
                            )
                        }
                        .foregroundStyle(OBColor.primary)
                    }
                }
            }
        }
        .background(OBColor.background)
        .navigationTitle("Load Calculator")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    /// Seeds every cost assumption from the ledger. Anything the ledger cannot
    /// prove remains unavailable in the result instead of being presented as $0.
    private func load() async {
        do {
            let seeded = try await repository.fetchCalculatorDefaults()
            defaults = seeded
            fuelPriceText = Self.seedText(seeded.fuelPrice)
            mpgText = Self.seedText(seeded.mpg)
            dispatchValueText = Self.seedText(seeded.dispatchPct)
            factoringValueText = Self.seedText(seeded.factoringPct)
            overheadPerMileText = seeded.basisSufficient
                ? Self.seedText(seeded.overheadPerMile)
                : ""
            targetProfitPerMileText = Self.seedText(seeded.targetProfitPerMile)
            refusal = nil
        } catch APIError.refused(let message) {
            refusal = message
        } catch {
            // Offline or a hiccup: the form still works, it just cannot claim
            // the numbers are his. `defaults` stays nil and the notes say so.
            refusal = nil
        }
        isLoading = false
    }

    // MARK: Result — the answer, up top

    private var resultCard: some View {
        VStack(alignment: .leading, spacing: OBSpacing.sm) {
            PanelHeader(title: "Is this load worth it?", trailing: nil)
            VStack(alignment: .leading, spacing: OBSpacing.sm) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        LabelXS("Contribution Profit")
                        MoneyText(amount: estimate.contributionProfit,
                                  font: .title.weight(.bold),
                                  color: estimate.contributionProfit >= 0 ? OBColor.pos : OBColor.neg)
                    }
                    Spacer()
                    RatingChip(rating: estimate.rating)
                }
                HStack(spacing: OBSpacing.lg) {
                    metric("Contribution / mi", estimate.contributionProfitPerMile.formatted(.currency(code: "USD").precision(.fractionLength(2))))
                    metric("Margin", "\(Int(estimate.contributionMargin))%")
                    metric("Deadhead", "\(Int(estimate.deadheadPct * 100))%")
                    metric("Total miles", "\(Int(estimate.totalMiles))")
                }

                Divider().overlay(OBColor.border)

                ForEach(estimate.lines) { line in
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(line.label).font(.subheadline).foregroundStyle(OBColor.foreground)
                            if let note = line.note {
                                Text(note).font(.caption2).foregroundStyle(OBColor.mutedForeground)
                            }
                        }
                        Spacer()
                        Text(line.amount, format: .currency(code: "USD").precision(.fractionLength(2)))
                            .font(.subheadline.weight(.medium))
                            .monospacedDigit()
                            .foregroundStyle(OBColor.mutedForeground)
                    }
                }

                Divider().overlay(OBColor.border)

                HStack {
                    Text("Gross rate").font(.subheadline.weight(.semibold)).foregroundStyle(OBColor.foreground)
                    Spacer()
                    Text(grossRate, format: .currency(code: "USD").precision(.fractionLength(2)))
                        .font(.subheadline.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(OBColor.foreground)
                }
            }
            .padding(OBSpacing.md)
        }
        .obPanel()
        .padding(.horizontal, OBSpacing.md)
    }

    /// Says where the overhead came from, and refuses to imply it is his when
    /// there are not enough recorded miles behind it.
    private var overheadNote: String {
        guard let defaults else {
            return "Sin conexión al ledger: este número no está sacado de tu camión."
        }
        if !defaults.basisSufficient {
            return "Todavía no hay millas suficientes registradas (\(Int(defaults.basisMiles).formatted()) mi). El punto de equilibrio operativo seguirá no disponible."
        }
        return "Tu costo real de \(defaults.basisLabel): \(Int(defaults.basisMiles).formatted()) mi. Sin combustible, peajes, dispatch ni factoring — esos se cobran arriba."
    }

    /// Fuel cannot be estimated without an MPG the odometer proved.
    @ViewBuilder
    private var mpgNote: some View {
        if defaults?.mpg == nil && mpg <= 0 {
            Text("Hacen falta dos lecturas de odómetro en el mismo camión para saber tu MPG. Escríbelo a mano para calcular.")
                .font(.caption2)
                .foregroundStyle(OBColor.warn)
        }
    }

    private func metric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased()).font(.system(size: 9, weight: .semibold)).foregroundStyle(OBColor.mutedForeground)
            Text(value).font(.caption.weight(.semibold)).monospacedDigit().foregroundStyle(OBColor.foreground)
        }
    }

    // MARK: Inputs

    private var inputsCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            PanelHeader(title: "Trip Details", trailing: nil)
            VStack(spacing: OBSpacing.md) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Contexto de la negociación")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(OBColor.mutedForeground)
                    Picker("Contexto de la negociación", selection: $rateContext) {
                        ForEach(RateContext.allCases) { context in
                            Text(context.label).tag(context)
                        }
                    }
                    .pickerStyle(.segmented)
                }
                if rateContext == .brokerOffer {
                    OBNumberRow(label: "Oferta del broker", prefix: "$", placeholder: "700", text: $grossRateText)
                }
                OBNumberRow(label: "Loaded miles", suffix: "mi", placeholder: "407", text: $loadedMilesText)
                OBNumberRow(label: "Deadhead miles", suffix: "mi", text: $deadheadMilesText)
                OBNumberRow(label: "Fuel price", prefix: "$", suffix: "/gal", placeholder: "3.85", text: $fuelPriceText)
                VStack(alignment: .leading, spacing: 4) {
                    OBNumberRow(label: "MPG", suffix: "mi/gal", placeholder: "8.5", text: $mpgText)
                    mpgNote
                }
                OBNumberRow(label: "Tolls", prefix: "$", text: $tollsText)
                feeRow("Dispatch", mode: $dispatchMode, text: $dispatchValueText)
                feeRow("Factoring", mode: $factoringMode, text: $factoringValueText)
                OBNumberRow(label: "Other costs", prefix: "$", text: $otherCostText)
                VStack(alignment: .leading, spacing: 4) {
                    OBNumberRow(label: "Overhead / mi", prefix: "$", suffix: "/mi", text: $overheadPerMileText)
                    Text(overheadNote)
                        .font(.caption2)
                        .foregroundStyle(defaults?.basisSufficient == false ? OBColor.warn : OBColor.mutedForeground)
                }
            }
            .padding(OBSpacing.md)
        }
        .obPanel()
        .padding(.horizontal, OBSpacing.md)
    }

    /// The one row `OBNumberRow` cannot cover, because a % / $ switch sits
    /// between the label and the field. Same text binding, same decimal pad.
    private func feeRow(_ label: String, mode: Binding<FeeMode>, text: Binding<String>) -> some View {
        HStack {
            Text(label).foregroundStyle(OBColor.foreground)
            Spacer(minLength: OBSpacing.sm)
            Picker("", selection: mode) {
                ForEach(FeeMode.allCases) { m in Text(m.rawValue).tag(m) }
            }
            .pickerStyle(.segmented)
            .frame(width: 90)
            TextField("0", text: text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .frame(width: 64)
                .monospacedDigit()
                .foregroundStyle(OBColor.foreground)
        }
        .frame(minHeight: 44)
    }

    // MARK: Target rate

    private var targetCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            PanelHeader(
                title: rateContext == .brokerOffer ? "Current Offer vs Thresholds" : "What Rate Should I Ask?",
                trailing: nil
            )
            VStack(alignment: .leading, spacing: OBSpacing.md) {
                if !estimate.valid {
                    Text(mpg > 0 ? "Ingresa las millas del viaje para calcular." : "Ingresa las millas y el MPG antes de calcular.")
                        .font(.caption)
                        .foregroundStyle(OBColor.warn)
                } else if rateContext == .brokerOffer && grossRate <= 0 {
                    Text("Ingresa la oferta actual del broker antes de evaluar la carga.")
                        .font(.caption)
                        .foregroundStyle(OBColor.warn)
                } else if rates.impossible {
                    Text("Dispatch + factoring fees add up to 100% or more of the rate — no rate can clear a profit at these fee settings.")
                        .font(.caption)
                        .foregroundStyle(OBColor.neg)
                } else if let comparison = offerComparison {
                    VStack(alignment: .leading, spacing: 4) {
                        LabelXS("Current Broker Offer")
                        MoneyText(amount: grossRate, font: .title.weight(.bold), color: OBColor.primary)
                    }
                    thresholdRow("Minimum Threshold", rates.minimum)
                    thresholdRow("Good Threshold", rates.good)
                    thresholdRow("Great Threshold", rates.great)
                    HStack {
                        LabelXS("Difference vs Great")
                        Spacer()
                        Text(signedMoney(comparison.differenceVsGreat))
                            .font(.headline.weight(.semibold))
                            .monospacedDigit()
                            .foregroundStyle(comparison.differenceVsGreat >= 0 ? OBColor.pos : OBColor.warn)
                    }

                    VStack(alignment: .leading, spacing: OBSpacing.sm) {
                        Text(offerRating(comparison.position))
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(offerColor(comparison.position))
                        Text(offerAction(comparison))
                            .font(.caption)
                            .foregroundStyle(OBColor.mutedForeground)
                        if let counter = comparison.suggestedCounteroffer {
                            Divider().overlay(OBColor.border)
                            HStack(alignment: .bottom) {
                                VStack(alignment: .leading, spacing: 3) {
                                    LabelXS("Suggested Counteroffer")
                                    Text("Adds 3% negotiation room (at least $25), then rounds up to $25.")
                                        .font(.caption2)
                                        .foregroundStyle(OBColor.mutedForeground)
                                }
                                Spacer()
                                MoneyText(amount: counter, font: .title2.weight(.bold), color: OBColor.primary)
                            }
                        }
                    }
                    .padding(OBSpacing.md)
                    .background(offerColor(comparison.position).opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                } else {
                    OBNumberRow(label: "Target operating profit / mi", prefix: "$", suffix: "/mi", placeholder: "1.50", text: $targetProfitPerMileText)
                    thresholdRow("Direct Cost Break-even", rates.directCostBreakEven)
                    availabilityRow(
                        "True Operating Break-even",
                        value: defaults?.basisSufficient == true ? rates.operatingBreakEven : nil,
                        unavailable: "More business cost history needed"
                    )
                    availabilityRow(
                        "Cash Break-even",
                        value: defaults?.debtServiceAvailable == true ? rates.cashBreakEven : nil,
                        unavailable: "More debt and financing history needed"
                    )
                    thresholdRow("Minimum Threshold", rates.minimum)
                    thresholdRow("Good Threshold", rates.good)
                    thresholdRow("Great Threshold", rates.great)
                    if defaults?.basisSufficient == true {
                        thresholdRow("Custom Operating Target", rates.customTarget)
                    }
                    HStack(alignment: .bottom) {
                        VStack(alignment: .leading, spacing: 3) {
                            LabelXS("Suggested Opening Quote")
                            Text("Adds 3% negotiation room (at least $25), then rounds up to $25.")
                                .font(.caption2)
                                .foregroundStyle(OBColor.mutedForeground)
                        }
                        Spacer()
                        MoneyText(
                            amount: defaults?.basisSufficient == true
                                ? rates.openingQuote
                                : LoadCalculatorMath.suggestedOpeningQuote(settlementTarget: rates.great),
                            font: .title2.weight(.bold),
                            color: OBColor.primary
                        )
                    }
                    .padding(OBSpacing.md)
                    .background(OBColor.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                }
            }
            .padding(OBSpacing.md)
        }
        .obPanel()
        .padding(.horizontal, OBSpacing.md)
        .padding(.bottom, OBSpacing.xl)
    }

    private func thresholdRow(_ label: String, _ value: Double) -> some View {
        HStack {
            Text(label).font(.subheadline.weight(.medium)).foregroundStyle(OBColor.foreground)
            Spacer()
            Text(value, format: .currency(code: "USD").precision(.fractionLength(2)))
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(OBColor.foreground)
        }
    }

    private func availabilityRow(_ label: String, value: Double?, unavailable: String) -> some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.subheadline.weight(.medium)).foregroundStyle(OBColor.foreground)
                if value == nil {
                    Text(unavailable).font(.caption2).foregroundStyle(OBColor.mutedForeground)
                }
            }
            Spacer()
            if let value {
                Text(value, format: .currency(code: "USD").precision(.fractionLength(2)))
                    .font(.subheadline.weight(.semibold)).monospacedDigit()
            } else {
                Text("Unavailable").font(.subheadline.weight(.semibold)).foregroundStyle(OBColor.warn)
            }
        }
    }

    private func signedMoney(_ value: Double) -> String {
        let amount = abs(value).formatted(.currency(code: "USD").precision(.fractionLength(2)))
        return value >= 0 ? "+\(amount)" : "−\(amount)"
    }

    private func offerRating(_ position: OfferPosition) -> String {
        switch position {
        case .great: return "GREAT LOAD"
        case .good: return "GOOD LOAD"
        case .marginal: return "MARGINAL LOAD"
        case .belowMinimum: return "BELOW MINIMUM"
        }
    }

    private func offerColor(_ position: OfferPosition) -> Color {
        switch position {
        case .great: return OBColor.pos
        case .good: return OBColor.info
        case .marginal: return OBColor.warn
        case .belowMinimum: return OBColor.neg
        }
    }

    private func offerAction(_ comparison: OfferComparison) -> String {
        switch comparison.position {
        case .great:
            return "The current offer already meets or exceeds your Great threshold. Do not negotiate downward."
        case .good:
            return "Good load. Counter toward \((comparison.settlementTarget ?? rates.great).formatted(.currency(code: "USD"))) to reach Great."
        case .marginal:
            return "Marginal but acceptable. Counter toward \((comparison.settlementTarget ?? rates.good).formatted(.currency(code: "USD"))) to reach Good."
        case .belowMinimum:
            return "Below your minimum threshold. Counter toward \((comparison.settlementTarget ?? rates.good).formatted(.currency(code: "USD"))) and do not settle below \(rates.minimum.formatted(.currency(code: "USD")))."
        }
    }
}
