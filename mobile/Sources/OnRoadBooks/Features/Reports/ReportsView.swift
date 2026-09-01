import SwiftUI
import UIKit

/// What can be exported. The list comes from the server, so a report added to
/// `lib/export.ts` appears here with no new build.
struct ReportsView: View {
    let repository: LedgerRepository

    @State private var reports: [ReportSummary] = []
    @State private var isLoading = true
    @State private var isBuildingPacket = false
    @State private var packetFailure: String?
    @State private var share: SharePayload?

    private var year: Int { Calendar.current.component(.year, from: Date()) }

    var body: some View {
        Group {
            if isLoading {
                ProgressView().tint(OBColor.primary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    Section {
                        Button {
                            buildPacket()
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text("Paquete de fin de año · \(String(year))")
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(OBColor.foreground)
                                    Text("Todo el año en un archivo, para el contador.")
                                        .font(.caption)
                                        .foregroundStyle(OBColor.mutedForeground)
                                }
                                Spacer()
                                if isBuildingPacket {
                                    ProgressView().tint(OBColor.primary)
                                } else {
                                    Image(systemName: "square.and.arrow.up")
                                        .foregroundStyle(OBColor.primary)
                                }
                            }
                            .padding(.vertical, 2)
                        }
                        .buttonStyle(.plain)
                        .disabled(isBuildingPacket)
                        .listRowBackground(OBColor.card)
                    } footer: {
                        Text(packetFailure ?? "Resumen del año más los seis reportes, en una sola hoja de cálculo. No calcula impuestos: tu contador declara, nosotros entregamos el archivo.")
                            .font(.caption)
                            .foregroundStyle(packetFailure == nil ? OBColor.mutedForeground : OBColor.neg)
                    }

                    ForEach(reports) { report in
                        NavigationLink {
                            ReportTableView(repository: repository, report: report)
                        } label: {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(report.label)
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(OBColor.foreground)
                                Text(report.description)
                                    .font(.caption)
                                    .foregroundStyle(OBColor.mutedForeground)
                            }
                            .padding(.vertical, 2)
                        }
                        .listRowBackground(OBColor.card)
                        .listRowSeparatorTint(OBColor.border)
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .background(OBColor.background)
        .navigationTitle("Reports")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $share) { payload in
            ShareSheet(url: payload.url)
        }
        .task {
            reports = (try? await repository.fetchReports()) ?? []
            isLoading = false
        }
    }

    private func buildPacket() {
        isBuildingPacket = true
        packetFailure = nil
        Task {
            do {
                share = SharePayload(url: try await repository.downloadYearEndPacket(year: year))
            } catch {
                packetFailure = (error as? LocalizedError)?.errorDescription
                    ?? "No se pudo generar el paquete."
            }
            isBuildingPacket = false
        }
    }
}

/// One report: the table to check a number, and the file to send it on.
///
/// Both come from the same `buildReport` definition on the server — the table
/// you read here is literally the rows the PDF will contain, not a second
/// version of the same idea assembled for a phone.
struct ReportTableView: View {
    let repository: LedgerRepository
    let report: ReportSummary

    @State private var table: ReportTable?
    @State private var isLoading = true
    @State private var choosingFormat = false
    @State private var isExporting = false
    @State private var failure: String?
    @State private var share: SharePayload?

    var body: some View {
        Group {
            if isLoading {
                ProgressView().tint(OBColor.primary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let table {
                tableBody(table)
            } else {
                Text(failure ?? "No se pudo cargar el reporte.")
                    .font(.subheadline)
                    .foregroundStyle(OBColor.mutedForeground)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(OBColor.background)
        .navigationTitle(report.label)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                if isExporting {
                    ProgressView().tint(OBColor.primary)
                } else {
                    Button { choosingFormat = true } label: {
                        Image(systemName: "square.and.arrow.up")
                    }
                    .accessibilityLabel(Text("Enviar reporte"))
                }
            }
        }
        .confirmationDialog("Enviar como", isPresented: $choosingFormat, titleVisibility: .visible) {
            Button("PDF") { export("pdf") }
            Button("Excel") { export("xlsx") }
            Button("CSV") { export("csv") }
            Button("Cancelar", role: .cancel) {}
        }
        .sheet(item: $share) { payload in
            ShareSheet(url: payload.url)
        }
        .task {
            do {
                table = try await repository.fetchReportTable(report.id)
            } catch {
                failure = (error as? LocalizedError)?.errorDescription
            }
            isLoading = false
        }
    }

    @ViewBuilder
    private func tableBody(_ table: ReportTable) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(table.title)
                .font(.footnote)
                .foregroundStyle(OBColor.mutedForeground)
                .padding(.horizontal, OBSpacing.md)
                .padding(.vertical, OBSpacing.sm)

            if let failure {
                Text(failure)
                    .font(.caption)
                    .foregroundStyle(OBColor.neg)
                    .padding(.horizontal, OBSpacing.md)
                    .padding(.bottom, OBSpacing.sm)
            }

            if table.rows.isEmpty {
                Text("No hay filas en este período.")
                    .font(.subheadline)
                    .foregroundStyle(OBColor.mutedForeground)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                // Horizontal inside vertical: a report is wide by nature, and
                // squeezing eleven columns into 390 points would make every one
                // of them unreadable.
                ScrollView([.horizontal, .vertical]) {
                    VStack(alignment: .leading, spacing: 0) {
                        HStack(spacing: 0) {
                            ForEach(Array(table.columns.enumerated()), id: \.offset) { _, column in
                                Text(column)
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(OBColor.mutedForeground)
                                    .frame(width: 130, alignment: .leading)
                                    .padding(.vertical, 8)
                                    .padding(.horizontal, OBSpacing.sm)
                            }
                        }
                        .background(OBColor.surfaceRaised)

                        ForEach(Array(table.rows.enumerated()), id: \.offset) { index, row in
                            HStack(spacing: 0) {
                                ForEach(Array(row.enumerated()), id: \.offset) { _, cell in
                                    Text(cell)
                                        .font(.caption)
                                        .monospacedDigit()
                                        .lineLimit(1)
                                        .foregroundStyle(OBColor.foreground)
                                        .frame(width: 130, alignment: .leading)
                                        .padding(.vertical, 7)
                                        .padding(.horizontal, OBSpacing.sm)
                                }
                            }
                            .background(index.isMultiple(of: 2) ? Color.clear : OBColor.surface)
                        }
                    }
                }
            }
        }
    }

    private func export(_ format: String) {
        isExporting = true
        failure = nil
        Task {
            do {
                let url = try await repository.downloadReport(report.id, format: format)
                share = SharePayload(url: url)
            } catch {
                failure = (error as? LocalizedError)?.errorDescription ?? "No se pudo generar el archivo."
            }
            isExporting = false
        }
    }
}

struct SharePayload: Identifiable {
    let id = UUID()
    let url: URL
}

/// The system share sheet, so a report can go straight to the accountant from
/// wherever the truck is parked.
struct ShareSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
