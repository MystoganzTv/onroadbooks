import SwiftUI

/// Which truck pays.
///
/// A unit is charged ONLY what it caused — its own loads, its own fuel, its
/// own repairs. Business overhead is reported apart, and the per-mile figure
/// beside it is an ALLOCATION: a way of pricing work, not a cost any single
/// truck incurred. Blurring those two is how a fleet convinces itself a good
/// truck is a bad one.
struct FleetView: View {
    let repository: LedgerRepository

    @State private var overview: FleetOverview?
    @State private var isLoading = true
    @State private var refusal: String?

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
            } else if let overview {
                ScrollView {
                    VStack(alignment: .leading, spacing: OBSpacing.lg) {
                        totals(overview)
                        units(overview)
                    }
                    .padding(.vertical, OBSpacing.md)
                }
            }
        }
        .background(OBColor.background)
        .navigationTitle("Flota")
        .navigationBarTitleDisplayMode(.inline)
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func totals(_ overview: FleetOverview) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            PanelHeader(title: "Toda la flota", trailing: overview.periodLabel)
            VStack(spacing: OBSpacing.md) {
                row("Ingresos", overview.revenue)
                row("Costos directos", -overview.directCosts, color: OBColor.neg)
                row("Contribución", overview.contribution, strong: true, color: OBColor.pos)
                Divider().overlay(OBColor.border)
                row("Gastos del negocio", -overview.overhead, color: OBColor.neg)
                row("Ganancia operativa", overview.operatingProfit, strong: true,
                    color: overview.operatingProfit >= 0 ? OBColor.pos : OBColor.neg)
                HStack {
                    Text("Gasto del negocio por milla")
                        .font(.caption)
                        .foregroundStyle(OBColor.mutedForeground)
                    Spacer()
                    Text(overview.overheadPerMile, format: .currency(code: "USD").precision(.fractionLength(2)))
                        .font(.caption.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(OBColor.foreground)
                }
                Text("Repartido entre todas las millas. Es una asignación para poner precio al trabajo, no un costo de un camión.")
                    .font(.caption2)
                    .foregroundStyle(OBColor.mutedForeground)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(OBSpacing.md)
        }
        .obPanel()
        .padding(.horizontal, OBSpacing.md)
    }

    private func units(_ overview: FleetOverview) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            PanelHeader(title: "Por unidad", trailing: "\(overview.units.count)")
            VStack(spacing: 0) {
                ForEach(Array(overview.units.enumerated()), id: \.element.id) { index, unit in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(unit.truckName)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(OBColor.foreground)
                            Spacer()
                            MoneyText(
                                amount: unit.contribution,
                                font: .subheadline.weight(.semibold),
                                color: unit.contribution >= 0 ? OBColor.pos : OBColor.neg
                            )
                        }
                        HStack(spacing: OBSpacing.lg) {
                            metric("Cargas", "\(unit.loadCount)")
                            metric("Millas", "\(Int(unit.totalMiles))")
                            metric("Contrib./mi", unit.contributionPerMile.formatted(.currency(code: "USD").precision(.fractionLength(2))))
                            metric("Costo/mi", unit.actualCostPerMile.formatted(.currency(code: "USD").precision(.fractionLength(2))))
                        }
                        if !unit.active {
                            Text("Retirado — su historial sigue contando en los períodos que trabajó.")
                                .font(.caption2)
                                .foregroundStyle(OBColor.mutedForeground)
                        }
                    }
                    .padding(.horizontal, OBSpacing.md)
                    .padding(.vertical, OBSpacing.sm)

                    if index < overview.units.count - 1 {
                        Rectangle().fill(OBColor.border).frame(height: 1)
                            .padding(.leading, OBSpacing.md)
                    }
                }
            }
        }
        .obPanel()
        .padding(.horizontal, OBSpacing.md)
        .padding(.bottom, OBSpacing.xl)
    }

    private func row(_ label: String, _ amount: Double, strong: Bool = false,
                     color: Color = OBColor.foreground) -> some View {
        HStack {
            Text(label)
                .font(strong ? .subheadline.weight(.semibold) : .subheadline)
                .foregroundStyle(OBColor.foreground)
            Spacer()
            MoneyText(amount: amount,
                      font: strong ? .subheadline.weight(.semibold) : .subheadline,
                      color: color)
        }
    }

    private func metric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(OBColor.mutedForeground)
            Text(value)
                .font(.caption.weight(.medium))
                .monospacedDigit()
                .foregroundStyle(OBColor.foreground)
        }
    }

    private func reload() async {
        do {
            overview = try await repository.fetchFleet()
            refusal = nil
        } catch APIError.refused(let message) {
            refusal = message
        } catch {
            refusal = nil
        }
        isLoading = false
    }
}
