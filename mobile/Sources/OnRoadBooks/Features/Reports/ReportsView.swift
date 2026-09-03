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
    /// "YYYY-MM". The report used to be whatever month the server considered
    /// current, which on the 3rd of a month is three days of rows.
    @State private var month = ReportMonth.current()

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
        .task(id: month) {
            // Full-screen spinner only for the first load. Switching months
            // keeps the table (and the menu that switched it) on screen.
            if table == nil { isLoading = true }
            failure = nil
            do {
                table = try await repository.fetchReportTable(report.id, month: month)
            } catch {
                // Deliberately keeping the last good table: the month menu
                // lives in its header, and dropping it would strand you on
                // an error screen with no way back to a month that loads.
                failure = (error as? LocalizedError)?.errorDescription
            }
            isLoading = false
        }
    }

    @ViewBuilder
    private func tableBody(_ table: ReportTable) -> some View {
        let widths = columnWidths(table)
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(table.title)
                    .font(.footnote)
                    .foregroundStyle(OBColor.mutedForeground)
                    .lineLimit(1)
                Spacer(minLength: OBSpacing.sm)
                Menu {
                    ForEach(ReportMonth.recent(), id: \.value) { option in
                        Button(option.label) { month = option.value }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(ReportMonth.label(for: month))
                        Image(systemName: "chevron.up.chevron.down").font(.caption2)
                    }
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(OBColor.primary)
                }
            }
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
                // Every column used to be 130pt wide, so thirty-three of them
                // came to 4,290pt of mostly air: a date needs half that and an
                // empty column needs none of it. Widths now follow the widest
                // cell actually in the column, which is what makes several of
                // them fit on screen at once.
                ScrollView([.horizontal, .vertical]) {
                    VStack(alignment: .leading, spacing: 0) {
                        HStack(spacing: 0) {
                            ForEach(Array(table.columns.enumerated()), id: \.offset) { index, column in
                                Text(column)
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(OBColor.mutedForeground)
                                    .frame(width: widths[index], alignment: .leading)
                                    .padding(.vertical, 8)
                                    .padding(.horizontal, OBSpacing.sm)
                            }
                        }
                        .background(OBColor.surfaceRaised)

                        ForEach(Array(table.rows.enumerated()), id: \.offset) { index, row in
                            HStack(spacing: 0) {
                                ForEach(Array(row.enumerated()), id: \.offset) { column, cell in
                                    Text(cell)
                                        .font(.caption)
                                        .monospacedDigit()
                                        .lineLimit(1)
                                        .foregroundStyle(OBColor.foreground)
                                        .frame(
                                            width: column < widths.count ? widths[column] : 96,
                                            alignment: .leading
                                        )
                                        .padding(.vertical, 7)
                                        .padding(.horizontal, OBSpacing.sm)
                                }
                            }
                            .background(index.isMultiple(of: 2) ? Color.clear : OBColor.surface)
                        }
                    }
                    // Two rows in a full-height scroll view were being centred,
                    // which read as a broken screen with a table stranded in
                    // the middle of it.
                    .frame(maxHeight: .infinity, alignment: .topLeading)
                }
            }
        }
    }

    /// Roughly how wide each column needs to be for its widest cell, clamped
    /// so a long note cannot push everything else off screen and an empty
    /// column still keeps a readable header stub.
    private func columnWidths(_ table: ReportTable) -> [CGFloat] {
        table.columns.indices.map { index in
            let header = table.columns[index].count
            let widest = table.rows.reduce(header) { longest, row in
                index < row.count ? max(longest, row[index].count) : longest
            }
            return min(max(CGFloat(widest) * 7.2, 56), 190)
        }
    }

    private func export(_ format: String) {
        isExporting = true
        failure = nil
        Task {
            do {
                let url = try await repository.downloadReport(report.id, format: format, month: month)
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


/// The months a report can be asked for: this one and the twelve before it,
/// which covers "the month I am settling" and "the same month last year".
enum ReportMonth {
    struct Option { let value: String; let label: String }

    private static var keyFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM"
        return formatter
    }

    private static var displayFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = .current
        formatter.setLocalizedDateFormatFromTemplate("MMMM yyyy")
        return formatter
    }

    static func current() -> String { keyFormatter.string(from: Date()) }

    static func recent() -> [Option] {
        let calendar = Calendar.current
        return (0..<13).compactMap { offset in
            guard let date = calendar.date(byAdding: .month, value: -offset, to: Date()) else { return nil }
            return Option(value: keyFormatter.string(from: date), label: displayFormatter.string(from: date))
        }
    }

    static func label(for value: String) -> String {
        guard let date = keyFormatter.date(from: value) else { return value }
        return displayFormatter.string(from: date)
    }
}
