import SwiftUI

/// Cut the invoice for a delivered load, from the cab.
///
/// Everything is pre-filled from what the server already knows — the next
/// number in the business's own sequence, the broker as the customer, today,
/// and net-30 — so the common case is open and save. The number is editable
/// because a broker who demands their own format is a real thing; the server
/// still refuses a duplicate.
struct IssueInvoiceView: View {
    let repository: LedgerRepository
    let invoice: Invoice
    let suggestedNumber: String
    let today: Date
    let onSaved: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var number = ""
    @State private var customer = ""
    @State private var issuedOn = Date()
    @State private var dueOn = Date()
    @State private var isSaving = false
    @State private var failure: String?

    private var canSave: Bool {
        !number.trimmingCharacters(in: .whitespaces).isEmpty
            && !customer.trimmingCharacters(in: .whitespaces).isEmpty
            && dueOn >= issuedOn
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        Text(invoice.lane)
                            .font(.subheadline)
                            .foregroundStyle(OBColor.foreground)
                        Spacer(minLength: OBSpacing.sm)
                        Text(invoice.amount, format: .currency(code: "USD").precision(.fractionLength(2)))
                            .font(.subheadline.weight(.semibold))
                            .monospacedDigit()
                            .foregroundStyle(OBColor.foreground)
                    }
                }
                .listRowBackground(OBColor.card)

                Section {
                    TextField("Cliente", text: $customer)
                    TextField("Número de factura", text: $number)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.characters)
                } footer: {
                    Text("Sugerido por el sistema: \(suggestedNumber). Si lo cambias, tiene que ser único.")
                        .foregroundStyle(OBColor.mutedForeground)
                }
                .listRowBackground(OBColor.card)

                Section {
                    DatePicker("Emitida", selection: $issuedOn, displayedComponents: .date)
                    DatePicker("Vence", selection: $dueOn, in: issuedOn..., displayedComponents: .date)
                } footer: {
                    Text("Neto 30 por defecto. La fecha de vencimiento es lo que hace que aparezca como atrasada.")
                        .foregroundStyle(OBColor.mutedForeground)
                }
                .listRowBackground(OBColor.card)

                if let failure {
                    Section {
                        Text(failure)
                            .font(.footnote)
                            .foregroundStyle(OBColor.neg)
                    }
                    .listRowBackground(OBColor.card)
                }
            }
            .scrollContentBackground(.hidden)
            .background(OBColor.background)
            .foregroundStyle(OBColor.foreground)
            .tint(OBColor.primary)
            .navigationTitle("Facturar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView().tint(OBColor.primary)
                    } else {
                        Button("Emitir", action: save).disabled(!canSave)
                    }
                }
            }
            .onAppear {
                if number.isEmpty { number = suggestedNumber }
                if customer.isEmpty { customer = invoice.customer ?? "" }
                issuedOn = today
                dueOn = Calendar.current.date(byAdding: .day, value: 30, to: today) ?? today
            }
        }
    }

    private func save() {
        guard canSave else { return }
        isSaving = true
        failure = nil
        Task {
            do {
                try await repository.issueInvoice(
                    loadId: invoice.loadId,
                    NewInvoice(
                        invoiceNumber: number.trimmingCharacters(in: .whitespaces),
                        invoiceDate: issuedOn,
                        dueDate: dueOn,
                        customer: customer.trimmingCharacters(in: .whitespaces)
                    )
                )
                onSaved()
                dismiss()
            } catch {
                failure = (error as? LocalizedError)?.errorDescription ?? "No se pudo emitir la factura."
                isSaving = false
            }
        }
    }
}
