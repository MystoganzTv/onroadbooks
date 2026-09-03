import SwiftUI

/// One driver statement, opened.
///
/// The loads it paid for, then everything added or taken off afterwards, each
/// on its own line. A net figure alone cannot answer the only question a
/// driver ever asks about a statement, which is why this one is smaller than
/// he expected.
struct DriverStatementDetailView: View {
    let repository: LedgerRepository
    let statementId: String

    @State private var detail: DriverStatementDetail?
    @State private var isLoading = true
    @State private var failure: String?

    var body: some View {
        Group {
            if isLoading {
                ProgressView().tint(OBColor.primary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let failure {
                Text(failure)
                    .font(.subheadline)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(OBColor.mutedForeground)
                    .padding(OBSpacing.lg)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let detail {
                ScrollView {
                    VStack(alignment: .leading, spacing: OBSpacing.lg) {
                        summary(detail)
                        loads(detail)
                        if !detail.adjustments.isEmpty { adjustments(detail) }
                    }
                    .padding(.vertical, OBSpacing.md)
                }
            }
        }
        .background(OBColor.background)
        .navigationTitle("Liquidación")
        .navigationBarTitleDisplayMode(.inline)
        .task { await reload() }
        .refreshable { await reload() }
    }

    private func summary(_ detail: DriverStatementDetail) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            PanelHeader(title: detail.statement.driverName, trailing: detail.statement.status)
            VStack(alignment: .leading, spacing: OBSpacing.sm) {
                Text("\(detail.statement.periodStart) → \(detail.statement.periodEnd)")
                    .font(.caption)
                    .foregroundStyle(OBColor.mutedForeground)

                line("Pago base", detail.statement.basePay)
                if detail.statement.additions > 0 { line("Extras", detail.statement.additions) }
                if detail.statement.deductions > 0 { line("Descuentos", -detail.statement.deductions, color: OBColor.neg) }
                if detail.statement.advances > 0 { line("Adelantos", -detail.statement.advances, color: OBColor.neg) }

                Divider().overlay(OBColor.border)

                HStack {
                    Text("Neto")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(OBColor.foreground)
                    Spacer()
                    MoneyText(amount: detail.statement.netPay, font: .title3.weight(.bold))
                }

                if let paidOn = detail.statement.paidOn {
                    Text("Pagada el \(paidOn). Una liquidación pagada es un registro contable permanente.")
                        .font(.caption2)
                        .foregroundStyle(OBColor.mutedForeground)
                }
            }
            .padding(OBSpacing.md)
        }
        .obPanel()
        .padding(.horizontal, OBSpacing.md)
    }

    private func loads(_ detail: DriverStatementDetail) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            PanelHeader(title: "Cargas", trailing: "\(detail.lines.count)")
            VStack(spacing: 0) {
                ForEach(Array(detail.lines.enumerated()), id: \.element.id) { index, line in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(line.loadLabel)
                                .font(.subheadline)
                                .foregroundStyle(OBColor.foreground)
                            Spacer()
                            MoneyText(amount: line.payAmount, font: .subheadline.weight(.semibold))
                        }
                        Text("\(line.date) · \(Int(line.totalMiles)) mi · bruto \(line.grossRevenue, format: .currency(code: "USD").precision(.fractionLength(0)))")
                            .font(.caption2)
                            .foregroundStyle(OBColor.mutedForeground)
                    }
                    .padding(.horizontal, OBSpacing.md)
                    .padding(.vertical, OBSpacing.sm)

                    if index < detail.lines.count - 1 {
                        Rectangle().fill(OBColor.border).frame(height: 1)
                            .padding(.leading, OBSpacing.md)
                    }
                }
            }
        }
        .obPanel()
        .padding(.horizontal, OBSpacing.md)
    }

    private func adjustments(_ detail: DriverStatementDetail) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            PanelHeader(title: "Ajustes", trailing: nil)
            VStack(spacing: 0) {
                ForEach(Array(detail.adjustments.enumerated()), id: \.element.id) { index, adjustment in
                    HStack {
                        Text(adjustment.label)
                            .font(.subheadline)
                            .foregroundStyle(OBColor.foreground)
                        Spacer()
                        MoneyText(
                            amount: adjustment.reducesPay ? -adjustment.amount : adjustment.amount,
                            font: .subheadline,
                            color: adjustment.reducesPay ? OBColor.neg : OBColor.foreground
                        )
                    }
                    .padding(.horizontal, OBSpacing.md)
                    .padding(.vertical, OBSpacing.sm)

                    if index < detail.adjustments.count - 1 {
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

    private func line(_ label: String, _ amount: Double, color: Color = OBColor.foreground) -> some View {
        HStack {
            Text(label).font(.subheadline).foregroundStyle(OBColor.mutedForeground)
            Spacer()
            MoneyText(amount: amount, font: .subheadline, color: color)
        }
    }

    private func reload() async {
        do {
            detail = try await repository.fetchDriverStatement(id: statementId)
            failure = nil
        } catch {
            failure = (error as? LocalizedError)?.errorDescription ?? "No se pudo abrir la liquidación."
        }
        isLoading = false
    }
}
