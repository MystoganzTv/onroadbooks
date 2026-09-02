import SwiftUI

/// The unit: what it has earned, what it has cost, and what it needs next.
///
/// Lifetime figures count only what this truck caused — business overhead is
/// charged once at the fleet level, because imputing it to a unit invents a
/// cost per truck. That rule lives in `truckLifetime` on the server and this
/// screen just prints what it returns.
struct TruckView: View {
    let repository: LedgerRepository

    @State private var truck: TruckSummary?
    @State private var isLoading = true
    @State private var failure: String?

    @State private var filingScope: FilingScope = .undecided
    @State private var isSavingFilingScope = false
    @State private var filingScopeSaveFailed = false

    var body: some View {
        Group {
            if isLoading {
                ProgressView().tint(OBColor.primary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let truck {
                content(truck)
            } else {
                VStack(spacing: OBSpacing.sm) {
                    Image(systemName: "steeringwheel")
                        .font(.system(size: 32))
                        .foregroundStyle(OBColor.mutedForeground)
                    Text(failure ?? "Todavía no hay ningún camión registrado.")
                        .font(.subheadline)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(OBColor.mutedForeground)
                        .padding(.horizontal, OBSpacing.lg)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(OBColor.background)
        .navigationTitle("Truck")
        .navigationBarTitleDisplayMode(.inline)
        .task { await reload() }
        .refreshable { await reload() }
    }

    @ViewBuilder
    private func content(_ truck: TruckSummary) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: OBSpacing.lg) {

                VStack(alignment: .leading, spacing: 4) {
                    Text(truck.name)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(OBColor.foreground)
                    if let detail = truck.detail {
                        Text(detail)
                            .font(.subheadline)
                            .foregroundStyle(OBColor.mutedForeground)
                    }
                    Text("\(truck.odometer.formatted()) mi en el odómetro")
                        .font(.caption)
                        .monospacedDigit()
                        .foregroundStyle(OBColor.mutedForeground)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(OBSpacing.md)
                .obPanel()
                .padding(.horizontal, OBSpacing.md)

                iftaFilingScopeCard(truck)

                // Per mile is how a truck is judged: the totals below are the
                // same numbers, but nobody compares two trucks by revenue.
                HStack(spacing: OBSpacing.sm) {
                    rateTile("Ganancia / mi", truck.profitPerMile,
                             color: truck.profitPerMile >= 0 ? OBColor.pos : OBColor.neg)
                    rateTile("Costo / mi", truck.costPerMile, color: OBColor.foreground)
                }
                .padding(.horizontal, OBSpacing.md)

                HStack(spacing: OBSpacing.sm) {
                    rateTile("Ingreso / mi", truck.revenuePerMile, color: OBColor.foreground)
                    VStack(alignment: .leading, spacing: 6) {
                        LabelXS("MPG")
                        Text(truck.milesPerGallon
                             .map { $0.formatted(.number.precision(.fractionLength(1))) } ?? "—")
                            .font(.title2.weight(.semibold))
                            .monospacedDigit()
                            .foregroundStyle(OBColor.foreground)
                        Text(truck.milesPerGallon == nil
                             ? "hacen falta dos odómetros"
                             : "\(truck.fuelCostPerMile.formatted(.currency(code: "USD").precision(.fractionLength(2)))) de diésel / mi")
                            .font(.caption)
                            .foregroundStyle(OBColor.mutedForeground)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(OBSpacing.md)
                    .obPanel()
                }
                .padding(.horizontal, OBSpacing.md)

                VStack(alignment: .leading, spacing: 0) {
                    PanelHeader(title: "De por vida", trailing: "\(truck.loadCount) loads")
                    VStack(spacing: 0) {
                        totalRow("Ingresos", truck.revenue)
                        divider
                        totalRow("Gastos del camión", truck.expenses)
                        divider
                        totalRow("Ganancia", truck.profit, color: truck.profit >= 0 ? OBColor.pos : OBColor.neg)
                        divider
                        HStack {
                            Text("Millas").font(.subheadline).foregroundStyle(OBColor.foreground)
                            Spacer()
                            Text("\(Int(truck.miles).formatted()) mi")
                                .font(.subheadline.weight(.medium))
                                .monospacedDigit()
                                .foregroundStyle(OBColor.foreground)
                        }
                        .padding(.horizontal, OBSpacing.md)
                        .padding(.vertical, OBSpacing.sm)
                    }
                }
                .obPanel()
                .padding(.horizontal, OBSpacing.md)

                if !truck.due.isEmpty {
                    VStack(alignment: .leading, spacing: 0) {
                        PanelHeader(title: "Mantenimiento")
                        VStack(spacing: 0) {
                            ForEach(Array(truck.due.enumerated()), id: \.element.id) { index, item in
                                DueRow(item: item)
                                    .padding(.horizontal, OBSpacing.md)
                                    .padding(.vertical, OBSpacing.sm)
                                if index < truck.due.count - 1 { divider }
                            }
                        }
                    }
                    .obPanel()
                    .padding(.horizontal, OBSpacing.md)
                }

                Spacer(minLength: OBSpacing.xl)
            }
            .padding(.top, OBSpacing.sm)
        }
    }

    private var divider: some View {
        Rectangle().fill(OBColor.border).frame(height: 1).padding(.leading, OBSpacing.md)
    }

    /// The per-truck IFTA filing decision (`Truck.iftaReportingEnabled` on the
    /// web) -- Included / Excluded / no decision yet. Same three states the
    /// web's Truck form and fleet dialog offer; see `iftaReportingLabel` in
    /// `lib/ifta-eligibility.ts`. Settable from the phone now instead of only
    /// from the web, so a truck IFTA is still waiting on doesn't have to sit
    /// there until someone opens a laptop.
    @ViewBuilder
    private func iftaFilingScopeCard(_ truck: TruckSummary) -> some View {
        VStack(alignment: .leading, spacing: OBSpacing.sm) {
            LabelXS("Declaración trimestral de IFTA")
            Picker("Declaración trimestral de IFTA", selection: $filingScope) {
                Text("Sin decidir").tag(FilingScope.undecided)
                Text("Incluido").tag(FilingScope.included)
                Text("Excluido").tag(FilingScope.excluded)
            }
            .pickerStyle(.segmented)
            .disabled(isSavingFilingScope)
            Text(filingScope == .undecided
                 ? "Sin esta decisión, el reporte de IFTA no puede completarse."
                 : "Puedes cambiarlo cuando quieras — afecta el próximo reporte de IFTA.")
                .font(.caption)
                .foregroundStyle(OBColor.mutedForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(OBSpacing.md)
        .obPanel()
        .padding(.horizontal, OBSpacing.md)
        .onChange(of: filingScope) { newValue in
            guard newValue.value != truck.iftaReportingEnabled else { return }
            Task { await saveFilingScope(truckId: truck.id, newValue: newValue) }
        }
        .alert("No se pudo guardar", isPresented: $filingScopeSaveFailed) {
            Button("Entendido") {}
        } message: {
            Text("No se pudo guardar la decisión de IFTA. Inténtalo de nuevo.")
        }
    }

    private func saveFilingScope(truckId: String, newValue: FilingScope) async {
        isSavingFilingScope = true
        do {
            try await repository.updateTruckIftaFilingScope(truckId: truckId, iftaReportingEnabled: newValue.value)
            await reload()
        } catch {
            filingScopeSaveFailed = true
            // Snap the control back to what the server actually has, rather
            // than showing a choice that didn't take.
            filingScope = FilingScope(truck?.iftaReportingEnabled)
        }
        isSavingFilingScope = false
    }

    private func rateTile(_ label: String, _ value: Double, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            LabelXS(label)
            Text(value, format: .currency(code: "USD").precision(.fractionLength(2)))
                .font(.title2.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(OBSpacing.md)
        .obPanel()
    }

    private func totalRow(_ label: String, _ amount: Double, color: Color = OBColor.foreground) -> some View {
        HStack {
            Text(label).font(.subheadline).foregroundStyle(OBColor.foreground)
            Spacer()
            Text(amount, format: .currency(code: "USD").precision(.fractionLength(2)))
                .font(.subheadline.weight(.medium))
                .monospacedDigit()
                .foregroundStyle(color)
        }
        .padding(.horizontal, OBSpacing.md)
        .padding(.vertical, OBSpacing.sm)
    }

    private func reload() async {
        do {
            let fetched = try await repository.fetchTruck()
            truck = fetched
            filingScope = FilingScope(fetched.iftaReportingEnabled)
            failure = nil
        } catch {
            failure = (error as? LocalizedError)?.errorDescription
        }
        isLoading = false
    }
}

/// Three states, same as `Truck.iftaReportingEnabled: boolean | null` on the
/// web -- `.undecided` is the initial state a truck starts in, not a fourth
/// option a user can pick their way back to once they've decided.
private enum FilingScope: Hashable {
    case undecided
    case included
    case excluded

    init(_ enabled: Bool?) {
        switch enabled {
        case true: self = .included
        case false: self = .excluded
        case nil: self = .undecided
        }
    }

    var value: Bool? {
        switch self {
        case .included: return true
        case .excluded: return false
        case .undecided: return nil
        }
    }
}

private struct DueRow: View {
    let item: MaintenanceDueItem

    /// Not a performance signal — a service that is late is a risk to the
    /// truck, which is the other thing red is for. `OK` gets no colour at all.
    private var tint: Color {
        switch item.status {
        case .overdue: return OBColor.neg
        case .dueSoon: return OBColor.warn
        case .ok, .unscheduled: return OBColor.mutedForeground
        }
    }

    private var statusText: String {
        switch item.status {
        case .overdue: return "Vencido"
        case .dueSoon: return "Pronto"
        case .ok: return "Al día"
        case .unscheduled: return "Sin programar"
        }
    }

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 3) {
                Text(item.label)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(OBColor.foreground)
                if let detail = remaining {
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(OBColor.mutedForeground)
                }
            }
            Spacer(minLength: OBSpacing.sm)
            Text(statusText)
                .font(.caption.weight(.semibold))
                .foregroundStyle(tint)
        }
    }

    private var remaining: String? {
        var parts: [String] = []
        if let miles = item.milesRemaining {
            parts.append(miles < 0 ? "\(abs(miles).formatted()) mi pasado" : "en \(miles.formatted()) mi")
        }
        if let days = item.daysRemaining {
            parts.append(days < 0 ? "\(abs(days)) días tarde" : "en \(days) días")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}
