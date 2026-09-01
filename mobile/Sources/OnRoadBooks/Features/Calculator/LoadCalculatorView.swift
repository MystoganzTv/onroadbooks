import SwiftUI

/// "What rate should I ask? Is this load worth it?" — the two questions
/// the web app's Load Calculator answers, per its own header comment.
/// `overheadPerMile` here is a placeholder default (see the note under the
/// field) until it's wired to the real trailing 90-day cost basis from
/// Settings/the ledger.
struct LoadCalculatorView: View {
    @State private var grossRate: Double = 1800
    @State private var loadedMiles: Double = 420
    @State private var deadheadMiles: Double = 45
    @State private var fuelPrice: Double = 3.85
    @State private var mpg: Double = 6.5
    @State private var tolls: Double = 18
    @State private var dispatchMode: FeeMode = .percent
    @State private var dispatchValue: Double = 10
    @State private var factoringMode: FeeMode = .percent
    @State private var factoringValue: Double = 3
    @State private var otherCost: Double = 0
    @State private var overheadPerMile: Double = 0.85
    @State private var targetProfitPerMile: Double = 0.75

    private var estimate: LoadEstimate {
        LoadCalculatorMath.evaluate(
            grossRate: grossRate, loadedMiles: loadedMiles, deadheadMiles: deadheadMiles,
            fuelPrice: fuelPrice, mpg: mpg, tolls: tolls,
            dispatchMode: dispatchMode, dispatchValue: dispatchValue,
            factoringMode: factoringMode, factoringValue: factoringValue,
            otherCost: otherCost, overheadPerMile: overheadPerMile
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
        ScrollView {
            VStack(alignment: .leading, spacing: OBSpacing.lg) {
                resultCard
                inputsCard
                targetCard
            }
            .padding(.vertical, OBSpacing.md)
        }
        .background(OBColor.background)
        .navigationTitle("Load Calculator")
        .navigationBarTitleDisplayMode(.inline)
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
                numberRow("Gross rate", "$", value: $grossRate)
                numberRow("Loaded miles", "mi", value: $loadedMiles)
                numberRow("Deadhead miles", "mi", value: $deadheadMiles)
                numberRow("Fuel price", "$/gal", value: $fuelPrice)
                numberRow("MPG", "mi/gal", value: $mpg)
                numberRow("Tolls", "$", value: $tolls)
                feeRow("Dispatch", mode: $dispatchMode, value: $dispatchValue)
                feeRow("Factoring", mode: $factoringMode, value: $factoringValue)
                numberRow("Other costs", "$", value: $otherCost)
                VStack(alignment: .leading, spacing: 4) {
                    numberRow("Overhead / mi", "$/mi", value: $overheadPerMile)
                    Text("Placeholder — will use your trailing 90-day cost basis once this app reads your ledger.")
                        .font(.caption2)
                        .foregroundStyle(OBColor.mutedForeground)
                }
            }
            .padding(OBSpacing.md)
        }
        .obPanel()
        .padding(.horizontal, OBSpacing.md)
    }

    private func numberRow(_ label: String, _ unit: String, value: Binding<Double>) -> some View {
        HStack {
            Text(label).font(.subheadline).foregroundStyle(OBColor.foreground)
            Spacer()
            TextField(label, value: value, format: .number)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .frame(width: 90)
                .monospacedDigit()
                .foregroundStyle(OBColor.foreground)
            Text(unit).font(.caption).foregroundStyle(OBColor.mutedForeground).frame(width: 42, alignment: .leading)
        }
    }

    private func feeRow(_ label: String, mode: Binding<FeeMode>, value: Binding<Double>) -> some View {
        HStack {
            Text(label).font(.subheadline).foregroundStyle(OBColor.foreground)
            Spacer()
            Picker("", selection: mode) {
                ForEach(FeeMode.allCases) { m in Text(m.rawValue).tag(m) }
            }
            .pickerStyle(.segmented)
            .frame(width: 90)
            TextField(label, value: value, format: .number)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .frame(width: 60)
                .monospacedDigit()
                .foregroundStyle(OBColor.foreground)
        }
    }

    // MARK: Target rate

    private var targetCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            PanelHeader(title: "What Rate Should I Ask?", trailing: nil)
            VStack(alignment: .leading, spacing: OBSpacing.md) {
                numberRow("Target profit / mi", "$/mi", value: $targetProfitPerMile)
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
