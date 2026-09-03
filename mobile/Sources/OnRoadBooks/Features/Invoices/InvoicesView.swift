import SwiftUI

/// Who owes you, and since when.
///
/// Sorted by what needs doing rather than by date: overdue first, then issued
/// and waiting, then delivered loads nobody has billed yet, then what came in.
/// Collected invoices are kept at the bottom and capped — they are proof the
/// screen works, not work.
struct InvoicesView: View {
    let repository: LedgerRepository

    @State private var ledger: InvoiceLedger?
    @State private var isLoading = true
    @State private var issuing: Invoice?
    @State private var collecting: Invoice?
    @State private var partialInvoice: Invoice?
    @State private var partialAmount = ""
    @State private var failure: String?

    private var overdue: [Invoice] { (ledger?.invoices ?? []).filter { $0.isIssued && $0.status == .invoiced && $0.isOverdue } }
    private var waiting: [Invoice] { (ledger?.invoices ?? []).filter { $0.isIssued && $0.status == .invoiced && !$0.isOverdue } }
    private var unbilled: [Invoice] { (ledger?.invoices ?? []).filter { !$0.isIssued } }
    private var collected: [Invoice] { (ledger?.invoices ?? []).filter { $0.isIssued && $0.status == .paid } }

    var body: some View {
        Group {
            if isLoading {
                ProgressView().tint(OBColor.primary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let ledger {
                content(ledger)
            } else {
                OBUnavailableView(title: "Facturas")
            }
        }
        .background(OBColor.background)
        .navigationTitle("Invoices")
        .navigationBarTitleDisplayMode(.inline)
        .task { await reload() }
        .refreshable { await reload() }
        .sheet(item: $issuing) { invoice in
            IssueInvoiceView(
                repository: repository,
                invoice: invoice,
                suggestedNumber: ledger?.suggestedNumber ?? "",
                today: ledger?.today ?? Date(),
                onSaved: { Task { await reload() } }
            )
        }
        .confirmationDialog(
            collecting.map { "Cobrar \($0.title)" } ?? "",
            isPresented: Binding(get: { collecting != nil }, set: { if !$0 { collecting = nil } }),
            titleVisibility: .visible
        ) {
            Button("Marcar cobrada hoy") {
                if let invoice = collecting { markPaid(invoice) }
                collecting = nil
            }
            Button("Registrar pago parcial") {
                partialInvoice = collecting
                partialAmount = ""
                collecting = nil
            }
            Button("Cancelar", role: .cancel) { collecting = nil }
        } message: {
            if let invoice = collecting {
                Text("\(invoice.outstandingAmount, format: .currency(code: "USD")) pendientes de \(invoice.customer ?? "el cliente"). Se registra con la fecha de hoy.")
            }
        }
        .alert(
            partialInvoice.map { "Pago parcial · \($0.title)" } ?? "Pago parcial",
            isPresented: Binding(get: { partialInvoice != nil }, set: { if !$0 { partialInvoice = nil } })
        ) {
            TextField("Monto", text: $partialAmount)
                .keyboardType(.decimalPad)
            Button("Guardar") {
                if let invoice = partialInvoice { recordPartial(invoice) }
                partialInvoice = nil
            }
            Button("Cancelar", role: .cancel) { partialInvoice = nil }
        } message: {
            if let invoice = partialInvoice {
                Text("Saldo actual: \(invoice.outstandingAmount, format: .currency(code: "USD"))")
            }
        }
    }

    @ViewBuilder
    private func content(_ ledger: InvoiceLedger) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: OBSpacing.lg) {

                HStack(spacing: OBSpacing.sm) {
                    tile("Por cobrar",
                         ledger.summary.outstandingAmount,
                         "\(ledger.summary.outstandingCount) facturas",
                         color: OBColor.foreground)
                    tile("Atrasado",
                         ledger.summary.overdueAmount,
                         ledger.summary.overdueCount == 0 ? "nada vencido" : "\(ledger.summary.overdueCount) facturas",
                         color: ledger.summary.overdueCount > 0 ? OBColor.neg : OBColor.foreground)
                }
                .padding(.horizontal, OBSpacing.md)

                if let failure {
                    Text(failure)
                        .font(.footnote)
                        .foregroundStyle(OBColor.neg)
                        .padding(.horizontal, OBSpacing.md)
                }

                section("Atrasadas", overdue, action: .collect)
                section("Por cobrar", waiting, action: .collect)
                section("Sin facturar", unbilled, action: .issue)
                section("Cobradas", Array(collected.prefix(5)), action: .none)

                Spacer(minLength: OBSpacing.xl)
            }
            .padding(.top, OBSpacing.sm)
        }
    }

    private enum RowAction { case collect, issue, none }

    @ViewBuilder
    private func section(_ title: String, _ rows: [Invoice], action: RowAction) -> some View {
        if !rows.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                PanelHeader(
                    title: title,
                    trailing: rows.reduce(0) { $0 + (action == .collect ? $1.outstandingAmount : $1.amount) }
                        .formatted(.currency(code: "USD").precision(.fractionLength(0)))
                )
                VStack(spacing: 0) {
                    ForEach(Array(rows.enumerated()), id: \.element.id) { index, invoice in
                        InvoiceRow(
                            invoice: invoice,
                            actionTitle: action == .collect ? "Cobrada" : action == .issue ? "Facturar" : nil,
                            onAction: {
                                if action == .collect { collecting = invoice }
                                if action == .issue { issuing = invoice }
                            }
                        )
                        .padding(.horizontal, OBSpacing.md)
                        .padding(.vertical, OBSpacing.sm)
                        if index < rows.count - 1 {
                            Rectangle().fill(OBColor.border).frame(height: 1)
                                .padding(.leading, OBSpacing.md)
                        }
                    }
                }
            }
            .obPanel()
            .padding(.horizontal, OBSpacing.md)
        }
    }

    private func tile(_ label: String, _ amount: Double, _ footnote: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            LabelXS(label)
            Text(amount, format: .currency(code: "USD").precision(.fractionLength(0)))
                .font(.title2.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(color)
            Text(footnote)
                .font(.caption)
                .foregroundStyle(OBColor.mutedForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(OBSpacing.md)
        .obPanel()
    }

    private func markPaid(_ invoice: Invoice) {
        failure = nil
        Task {
            do {
                try await repository.markInvoicePaid(loadId: invoice.loadId, on: ledger?.today ?? Date())
                await reload()
            } catch {
                failure = (error as? LocalizedError)?.errorDescription ?? "No se pudo marcar como cobrada."
            }
        }
    }

    private func recordPartial(_ invoice: Invoice) {
        failure = nil
        guard let amount = Double(partialAmount.replacingOccurrences(of: ",", with: ".")), amount > 0 else {
            failure = "Escribe un monto válido."
            return
        }
        Task {
            do {
                try await repository.recordInvoicePayment(loadId: invoice.loadId, amount: amount, on: ledger?.today ?? Date())
                await reload()
            } catch {
                failure = (error as? LocalizedError)?.errorDescription ?? "No se pudo registrar el pago."
            }
        }
    }

    private func reload() async {
        ledger = try? await repository.fetchInvoices()
        isLoading = false
    }
}

private struct InvoiceRow: View {
    let invoice: Invoice
    let actionTitle: String?
    let onAction: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: OBSpacing.sm) {
            VStack(alignment: .leading, spacing: 3) {
                Text(invoice.customer ?? invoice.title)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(OBColor.foreground)
                Text(invoice.lane)
                    .font(.caption)
                    .foregroundStyle(OBColor.mutedForeground)
                    .lineLimit(1)
                if let days = invoice.overdueDays, days > 0 {
                    Text("\(days) días de atraso · \(invoice.title)")
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(OBColor.neg)
                } else {
                    Text(invoice.title)
                        .font(.caption2)
                        .foregroundStyle(OBColor.mutedForeground)
                }
            }

            Spacer(minLength: 0)

            VStack(alignment: .trailing, spacing: 6) {
                Text((invoice.outstandingAmount > 0 ? invoice.outstandingAmount : invoice.amount), format: .currency(code: "USD").precision(.fractionLength(0)))
                    .font(.subheadline.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(OBColor.foreground)
                if invoice.collectedAmount > 0 && invoice.outstandingAmount > 0 {
                    Text("\(invoice.collectedAmount, format: .currency(code: "USD").precision(.fractionLength(0))) cobrado")
                        .font(.caption2)
                        .foregroundStyle(OBColor.mutedForeground)
                }
                if let actionTitle {
                    Button(actionTitle, action: onAction)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(OBColor.primary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(OBColor.surfaceRaised, in: Capsule())
                        .buttonStyle(.plain)
                }
            }
        }
    }
}
