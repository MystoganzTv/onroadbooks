import SwiftUI

/// The IFTA quarter — as a filing draft, never as a filing.
///
/// The whole value of this screen is what it refuses. A quarter with unassigned
/// miles, or a jurisdiction with no rate on file, is not ready, and the total
/// comes back nil rather than as a number that looks filable. Showing a
/// confident figure built on incomplete mileage is how somebody files wrong.
struct IftaView: View {
    let repository: LedgerRepository

    @State private var report: IftaReport?
    @State private var isLoading = true
    @State private var failure: String?

    var body: some View {
        Group {
            if isLoading {
                ProgressView().tint(OBColor.primary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let report {
                content(report)
            } else {
                Text(failure ?? "No se pudo cargar el trimestre.")
                    .font(.subheadline)
                    .foregroundStyle(OBColor.mutedForeground)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(OBColor.background)
        .navigationTitle("IFTA")
        .navigationBarTitleDisplayMode(.inline)
        .task { await reload() }
        .refreshable { await reload() }
    }

    @ViewBuilder
    private func content(_ report: IftaReport) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: OBSpacing.lg) {

                VStack(alignment: .leading, spacing: 6) {
                    LabelXS(report.quarter)
                    if report.complete, let due = report.netTaxDue {
                        Text(due, format: .currency(code: "USD").precision(.fractionLength(2)))
                            .font(.largeTitle.weight(.semibold))
                            .monospacedDigit()
                            .foregroundStyle(OBColor.foreground)
                        Text("neto del trimestre · borrador para declarar")
                            .font(.caption)
                            .foregroundStyle(OBColor.mutedForeground)
                    } else {
                        Text("Sin total")
                            .font(.title2.weight(.semibold))
                            .foregroundStyle(OBColor.mutedForeground)
                        Text("El trimestre no está completo. Un número aquí se vería listo para declarar sin serlo.")
                            .font(.caption)
                            .foregroundStyle(OBColor.warn)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(OBSpacing.md)
                .obPanel()
                .padding(.horizontal, OBSpacing.md)

                if !report.complete {
                    VStack(alignment: .leading, spacing: OBSpacing.sm) {
                        LabelXS("Qué falta")
                        if report.unassignedMiles > 0 {
                            missing("\(Int(report.unassignedMiles).formatted()) millas sin jurisdicción asignada")
                        }
                        if report.unassignedGallons > 0 {
                            missing("\(report.unassignedGallons.formatted(.number.precision(.fractionLength(1)))) galones sin estado")
                        }
                        if !report.missingRateJurisdictions.isEmpty {
                            missing("Sin tarifa en: \(report.missingRateJurisdictions.joined(separator: ", "))")
                        }
                        // A truck's own filing decision (Camión → Declaración
                        // trimestral de IFTA) is a THIRD, separate reason the
                        // total can be withheld -- unrelated to mileage or
                        // rates, and one this screen cannot resolve itself:
                        // there is no /api/mobile/truck write route yet.
                        if !report.filingScopeComplete {
                            missing(report.pendingTruckCount == 1
                                ? "1 camión sin decisión de inclusión en IFTA — complétalo desde la web (Camión → Declaración trimestral de IFTA)."
                                : "\(report.pendingTruckCount) camiones sin decisión de inclusión en IFTA — complétalo desde la web (Camión → Declaración trimestral de IFTA).")
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(OBSpacing.md)
                    .obPanel()
                    .padding(.horizontal, OBSpacing.md)
                }

                HStack(spacing: OBSpacing.sm) {
                    tile("Millas", "\(Int(report.totalFleetMiles).formatted())",
                         footnote: "\(Int(report.assignedMiles).formatted()) asignadas")
                    tile("MPG de flota",
                         report.fleetMpg > 0
                            ? report.fleetMpg.formatted(.number.precision(.fractionLength(2)))
                            : "—",
                         footnote: "\(report.totalGallons.formatted(.number.precision(.fractionLength(1)))) gal")
                }
                .padding(.horizontal, OBSpacing.md)

                if !report.jurisdictions.isEmpty {
                    VStack(alignment: .leading, spacing: 0) {
                        PanelHeader(title: "Por jurisdicción")
                        VStack(spacing: 0) {
                            ForEach(Array(report.jurisdictions.enumerated()), id: \.element.id) { index, row in
                                JurisdictionRow(row: row)
                                    .padding(.horizontal, OBSpacing.md)
                                    .padding(.vertical, OBSpacing.sm)
                                if index < report.jurisdictions.count - 1 {
                                    Rectangle().fill(OBColor.border).frame(height: 1)
                                        .padding(.leading, OBSpacing.md)
                                }
                            }
                        }
                    }
                    .obPanel()
                    .padding(.horizontal, OBSpacing.md)
                }

                Text("Borrador construido con tus propias millas y combustible. No determina tu obligación fiscal ni sustituye la declaración.")
                    .font(.caption2)
                    .foregroundStyle(OBColor.mutedForeground)
                    .padding(.horizontal, OBSpacing.md)

                Spacer(minLength: OBSpacing.xl)
            }
            .padding(.top, OBSpacing.sm)
        }
    }

    private func missing(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.caption)
                .foregroundStyle(OBColor.warn)
            Text(text)
                .font(.subheadline)
                .foregroundStyle(OBColor.foreground)
        }
    }

    private func tile(_ label: String, _ value: String, footnote: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            LabelXS(label)
            Text(value)
                .font(.title2.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(OBColor.foreground)
            Text(footnote)
                .font(.caption)
                .foregroundStyle(OBColor.mutedForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(OBSpacing.md)
        .obPanel()
    }

    private func reload() async {
        do {
            report = try await repository.fetchIfta(quarter: nil)
            failure = nil
        } catch {
            failure = (error as? LocalizedError)?.errorDescription
        }
        isLoading = false
    }
}

private struct JurisdictionRow: View {
    let row: IftaJurisdiction

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 3) {
                Text(row.jurisdiction)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(OBColor.foreground)
                Text("\(Int(row.taxableMiles).formatted()) mi gravables · \(row.taxPaidGallons.formatted(.number.precision(.fractionLength(1)))) gal pagados")
                    .font(.caption)
                    .foregroundStyle(OBColor.mutedForeground)
            }
            Spacer(minLength: OBSpacing.sm)
            if let due = row.taxDue {
                Text(due, format: .currency(code: "USD").precision(.fractionLength(2)))
                    .font(.subheadline.weight(.medium))
                    .monospacedDigit()
                    .foregroundStyle(OBColor.foreground)
            } else {
                Text("sin tarifa")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(OBColor.warn)
            }
        }
    }
}
