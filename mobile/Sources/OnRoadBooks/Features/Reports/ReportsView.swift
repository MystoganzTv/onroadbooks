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
                // A 33-column grid on a 390pt screen is a spreadsheet read
                // through a keyhole: you scroll sideways past empty columns to
                // reach the next number and lose the row you were on. And a
                // short table in a two-axis ScrollView gets centred, which is
                // why it used to sit stranded in the middle of the screen. One
                // card per row reads downward instead — the direction a phone
                // already scrolls. The wide table still exists: it is what the
                // PDF, Excel and CSV exports carry.
                ScrollView {
                    LazyVStack(spacing: OBSpacing.sm) {
                        ForEach(Array(table.rows.enumerated()), id: \.offset) { _, row in
                            ReportRowCard(columns: table.columns, row: row)
                        }
                    }
                    .padding(.horizontal, OBSpacing.md)
                    .padding(.vertical, OBSpacing.sm)
                }
            }
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



/// One row of a report, read top to bottom.
///
/// Reports are generic — six of them, each with its own columns — so there is
/// no per-report headline to lift out. The first populated fields lead, and
/// the rest open on demand. Empty cells are dropped: a card that spells out
/// "Ending Odometer  —" on every load buries the fields that do carry a
/// number. Nothing is lost by it — the exports still carry every column.
private struct ReportRowCard: View {
    let columns: [String]
    let row: [String]

    @State private var isExpanded = false

    private static let collapsedCount = 4

    private var fields: [(label: String, value: String)] {
        columns.indices.compactMap { index in
            guard index < row.count else { return nil }
            let value = row[index].trimmingCharacters(in: .whitespaces)
            guard !value.isEmpty else { return nil }
            return (columns[index], value)
        }
    }

    var body: some View {
        let populated = fields
        let visible = isExpanded ? populated : Array(populated.prefix(Self.collapsedCount))

        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(visible.enumerated()), id: \.offset) { index, field in
                HStack(alignment: .firstTextBaseline, spacing: OBSpacing.sm) {
                    Text(field.label)
                        .font(.caption)
                        .foregroundStyle(OBColor.mutedForeground)
                    Spacer(minLength: OBSpacing.sm)
                    Text(field.value)
                        .font(.subheadline)
                        .monospacedDigit()
                        .multilineTextAlignment(.trailing)
                        .foregroundStyle(OBColor.foreground)
                }
                .padding(.horizontal, OBSpacing.md)
                .padding(.vertical, 7)

                if index < visible.count - 1 {
                    Rectangle().fill(OBColor.border).frame(height: 1)
                        .padding(.leading, OBSpacing.md)
                }
            }

            if populated.count > Self.collapsedCount {
                Button {
                    withAnimation(.easeInOut(duration: 0.18)) { isExpanded.toggle() }
                } label: {
                    HStack(spacing: 4) {
                        Text(isExpanded ? "Ver menos" : "Ver los \(populated.count) campos")
                        Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                            .font(.caption2)
                    }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(OBColor.primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, OBSpacing.md)
                    .padding(.vertical, OBSpacing.sm)
                }
                .buttonStyle(.plain)
            }
        }
        .obPanel()
    }
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
