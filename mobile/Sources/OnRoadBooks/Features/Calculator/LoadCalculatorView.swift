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
            thresholds: thresholds
        )
    }

    private var rates: (breakeven: Double, target: Double, totalMiles: Double, impossible: Bool) {
        LoadCalculatorMath.targetRate(
            loadedMiles: loadedMiles, deadheadMiles: deadheadMiles,
            fuelPrice: fuelPrice, mpg: mpg, tolls: tolls,
            dispatchMode: dispatchMode, dispatchValue: dispatchValue,
            factoringMode: factoringMode, factoringValue: factoringValue,
            otherCost: otherCost, overheadPerMile: overheadPerMile,
            targetProfitPerMile: targetProfitPerMile
        )
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
                        resultCard
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
    /// prove is left at zero, which the estimate treats as "cannot cost this".
    private func load() async {
        do {
            let seeded = try await repository.fetchCalculatorDefaults()
            defaults = seeded
            fuelPriceText = Self.seedText(seeded.fuelPrice)
            mpgText = Self.seedText(seeded.mpg)
            dispatchValueText = Self.seedText(seeded.dispatchPct)
            factoringValueText = Self.seedText(seeded.factoringPct)
            overheadPerMileText = Self.seedText(seeded.overheadPerMile)
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
                        LabelXS("Profit")
                        MoneyText(amount: estimate.profit,
                                  font: .title.weight(.bold),
                                  color: estimate.profit >= 0 ? OBColor.pos : OBColor.neg)
                    }
                    Spacer()
                    RatingChip(rating: estimate.rating)
                }
                HStack(spacing: OBSpacing.lg) {
                    metric("Profit / mi", estimate.profitPerMile.formatted(.currency(code: "USD").precision(.fractionLength(2))))
                    metric("Margin", "\(Int(estimate.profitMargin))%")
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
            return "Todavía no hay millas suficientes registradas (\(Int(defaults.basisMiles).formatted()) mi) para respaldar este costo. Trátalo como estimado."
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
                OBNumberRow(label: "Gross rate", prefix: "$", placeholder: "700", text: $grossRateText)
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
            PanelHeader(title: "What Rate Should I Ask?", trailing: nil)
            VStack(alignment: .leading, spacing: OBSpacing.md) {
                OBNumberRow(label: "Target profit / mi", prefix: "$", suffix: "/mi", placeholder: "1.50", text: $targetProfitPerMileText)
                if rates.impossible {
                    Text("Dispatch + factoring fees add up to 100% or more of the rate — no rate can clear a profit at these fee settings.")
                        .font(.caption)
                        .foregroundStyle(OBColor.neg)
                } else {
                    HStack(spacing: OBSpacing.sm) {
                        VStack(alignment: .leading, spacing: 4) {
                            LabelXS("Breakeven")
                            MoneyText(amount: rates.breakeven, font: .title3.weight(.semibold))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        VStack(alignment: .leading, spacing: 4) {
                            LabelXS("Ask For")
                            MoneyText(amount: rates.target, font: .title3.weight(.semibold), color: OBColor.primary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
            .padding(OBSpacing.md)
        }
        .obPanel()
        .padding(.horizontal, OBSpacing.md)
        .padding(.bottom, OBSpacing.xl)
    }
}
