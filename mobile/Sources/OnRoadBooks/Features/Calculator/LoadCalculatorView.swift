import SwiftUI
import UIKit

/// One offer decision using direct trip costs. Recorded business expenses
/// appear separately as monthly context, exactly as on the web.
struct LoadCalculatorView: View {
    let repository: LedgerRepository

    @State private var defaults: CalculatorDefaults?
    @State private var isLoading = true
    @State private var refusal: String?

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

    private var grossRate: Double { OBNumber.parse(grossRateText) ?? 0 }
    private var loadedMiles: Double { OBNumber.parse(loadedMilesText) ?? 0 }
    private var deadheadMiles: Double { OBNumber.parse(deadheadMilesText) ?? 0 }
    private var fuelPrice: Double { OBNumber.parse(fuelPriceText) ?? 0 }
    private var mpg: Double { OBNumber.parse(mpgText) ?? 0 }
    private var tolls: Double { OBNumber.parse(tollsText) ?? 0 }
    private var dispatchValue: Double { OBNumber.parse(dispatchValueText) ?? 0 }
    private var factoringValue: Double { OBNumber.parse(factoringValueText) ?? 0 }
    private var otherCost: Double { OBNumber.parse(otherCostText) ?? 0 }

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
        // Offline fallback: the web's DEFAULT_RATING_THRESHOLDS (contribution per total mile).
        defaults?.thresholds ?? RatingThresholds(great: 1.25, good: 0.90, marginal: 0.60)
    }

    private var estimate: LoadEstimate {
        LoadCalculatorMath.evaluate(
            grossRate: grossRate, loadedMiles: loadedMiles, deadheadMiles: deadheadMiles,
            fuelPrice: fuelPrice, mpg: mpg, tolls: tolls,
            dispatchMode: dispatchMode, dispatchValue: dispatchValue,
            factoringMode: factoringMode, factoringValue: factoringValue,
            otherCost: otherCost, overheadPerMile: 0,
            debtServicePerMile: 0,
            thresholds: thresholds
        )
    }

    private var rates: TargetRates {
        LoadCalculatorMath.targetRate(
            loadedMiles: loadedMiles, deadheadMiles: deadheadMiles,
            fuelPrice: fuelPrice, mpg: mpg, tolls: tolls,
            dispatchMode: dispatchMode, dispatchValue: dispatchValue,
            factoringMode: factoringMode, factoringValue: factoringValue,
            otherCost: otherCost, overheadPerMile: 0,
            debtServicePerMile: 0,
            thresholds: thresholds,
            targetProfitPerMile: 0
        )
    }

    private var offerComparison: OfferComparison? {
        grossRate > 0
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
                        if grossRate > 0 && estimate.valid {
                            resultCard
                        }
                        inputsCard
                        targetCard
                        businessExpensesCard
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

    /// Uses the same trip defaults and separate monthly context as the web.
    private func load() async {
        do {
            let seeded = try await repository.fetchCalculatorDefaults()
            defaults = seeded
            fuelPriceText = Self.seedText(seeded.fuelPrice)
            mpgText = Self.seedText(seeded.mpg)
            dispatchValueText = Self.seedText(seeded.dispatchPct)
            factoringValueText = Self.seedText(seeded.factoringPct)
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
            PanelHeader(title: "Trip profit", trailing: nil)
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
                    deadheadMetric
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

                Text("After fuel, tolls, dispatch, factoring and other trip costs. Monthly business expenses are shown separately below.")
                    .font(.caption).foregroundStyle(OBColor.mutedForeground)

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

    /// Fuel estimates need a reference MPG supplied by the user.
    @ViewBuilder
    private var mpgNote: some View {
        if defaults?.mpg == nil && mpg <= 0 {
            Text("Ingresa un MPG de referencia para estimar el combustible del viaje.")
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
                OBNumberRow(label: "Gross rate offered", prefix: "$", placeholder: "700", text: $grossRateText)
                OBNumberRow(label: "Loaded miles", suffix: "mi", placeholder: "407", text: $loadedMilesText)
                OBNumberRow(label: "Deadhead miles", suffix: "mi", text: $deadheadMilesText)
                OBNumberRow(label: "Fuel price", prefix: "$", suffix: "/gal", placeholder: "3.85", text: $fuelPriceText)
                VStack(alignment: .leading, spacing: 4) {
                    OBNumberRow(label: "MPG de referencia", suffix: "mi/gal", placeholder: "8.5", text: $mpgText)
                    mpgNote
                }
                OBNumberRow(label: "Tolls", prefix: "$", text: $tollsText)
                feeRow("Dispatch", mode: $dispatchMode, text: $dispatchValueText)
                feeRow("Factoring", mode: $factoringMode, text: $factoringValueText)
                OBNumberRow(label: "Other costs", prefix: "$", text: $otherCostText)
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
                title: "Should I take it?",
                trailing: nil
            )
            VStack(alignment: .leading, spacing: OBSpacing.md) {
                if !estimate.valid {
                    Text(mpg > 0 ? "Ingresa las millas del viaje para calcular." : "Ingresa las millas y el MPG antes de calcular.")
                        .font(.caption)
                        .foregroundStyle(OBColor.warn)
                } else if grossRate <= 0 {
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

    /// `deadheadWarnPct` arrives on every load of this screen and was read by
    /// nothing, so the threshold the owner configured never coloured anything.
    private var deadheadMetric: some View {
        let pct = estimate.deadheadPct * 100
        let elevated = (defaults?.deadheadWarnPct).map { pct > $0 } ?? false
        return VStack(alignment: .leading, spacing: 2) {
            Text("DEADHEAD")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(OBColor.mutedForeground)
            Text("\(Int(pct))%")
                .font(.caption.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(elevated ? OBColor.warn : OBColor.foreground)
        }
    }

    private var businessExpensesCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            PanelHeader(title: "Business expenses this month", trailing: defaults?.businessExpenses?.month)
            VStack(alignment: .leading, spacing: OBSpacing.sm) {
                Text("Recorded expenses for this truck and shared business expenses. Reference only: these are not deducted from this trip.")
                    .font(.caption).foregroundStyle(OBColor.mutedForeground)
                if let expenses = defaults?.businessExpenses {
                    if expenses.entries.isEmpty {
                        Text("No business expenses recorded for this month.")
                            .font(.subheadline).foregroundStyle(OBColor.mutedForeground)
                    } else {
                        ForEach(expenses.entries) { entry in
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(entry.description).font(.subheadline)
                                    if entry.scope == "BUSINESS" {
                                        Text("Shared business expense").font(.caption2).foregroundStyle(OBColor.mutedForeground)
                                    }
                                }
                                Spacer()
                                MoneyText(amount: entry.amount, font: .subheadline)
                            }
                        }
                    }
                    Divider().overlay(OBColor.border)
                    thresholdRow("Recorded total", expenses.total)
                } else {
                    Text("Monthly expenses unavailable. Reconnect to load your recorded expenses.")
                        .font(.caption).foregroundStyle(OBColor.warn)
                }
            }
            .padding(OBSpacing.md)
        }
        .obPanel()
        .padding(.horizontal, OBSpacing.md)
        .padding(.bottom, OBSpacing.xl)
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
