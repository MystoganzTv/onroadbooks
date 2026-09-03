import SwiftUI

/// Edits the cash payment and both accounting rows as one indivisible unit.
/// There is deliberately no category picker, receipt number or photo upload:
/// those controls would make one half look like an ordinary standalone gasto.
struct DebtPaymentEditorView: View {
    let repository: LedgerRepository
    let paymentId: String
    let onSaved: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var record: DebtPaymentDetail?
    @State private var isLoading = true
    @State private var loadFailure: String?

    @State private var date = Date()
    @State private var description = ""
    @State private var vendor = ""
    @State private var paymentText = ""
    @State private var principalText = ""
    @State private var interestText = ""
    @State private var recurring = false
    @State private var notes = ""
    @State private var isSaving = false
    @State private var failure: String?
    @State private var confirmingDelete = false
    @State private var isDeleting = false

    private var paymentAmount: Double? { OBNumber.parse(paymentText) }
    private var principalAmount: Double? { OBNumber.parse(principalText) }
    private var interestAmount: Double? { OBNumber.parse(interestText) }

    private static func cents(_ value: Double) -> Int { Int((value * 100).rounded()) }

    private var differenceCents: Int? {
        guard let paymentAmount, let principalAmount, let interestAmount else { return nil }
        return Self.cents(paymentAmount) - Self.cents(principalAmount) - Self.cents(interestAmount)
    }

    private var balanced: Bool { differenceCents == 0 }

    private var canSave: Bool {
        guard let paymentAmount, let principalAmount, let interestAmount else { return false }
        return paymentAmount > 0
            && principalAmount >= 0
            && interestAmount >= 0
            && balanced
            && !description.trimmingCharacters(in: .whitespaces).isEmpty
            && !isSaving
            && !isDeleting
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading {
                    ProgressView().tint(OBColor.primary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let loadFailure {
                    Text(loadFailure)
                        .font(.subheadline)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(OBColor.mutedForeground)
                        .padding(OBSpacing.lg)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    form
                }
            }
            .background(OBColor.background)
            .navigationTitle("Pago financiado")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { dismiss() }.disabled(isSaving || isDeleting)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView().tint(OBColor.primary)
                    } else {
                        Button("Guardar", action: save).disabled(!canSave)
                    }
                }
            }
            .task { await load() }
            .confirmationDialog(
                "¿Borrar el pago completo?",
                isPresented: $confirmingDelete,
                titleVisibility: .visible
            ) {
                Button("Borrar principal e interés", role: .destructive, action: deletePayment)
                Button("Cancelar", role: .cancel) {}
            } message: {
                Text("Se eliminará la transacción completa. Nunca se borra solo una parte del desglose.")
            }
        }
    }

    private var form: some View {
        Form {
            Section {
                HStack(alignment: .top, spacing: OBSpacing.sm) {
                    Image(systemName: "lock.shield.fill")
                        .foregroundStyle(OBColor.primary)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(record?.obligationName ?? "Financiamiento")
                            .font(.subheadline.weight(.semibold))
                        Text("OnRoad guarda principal e interés juntos para que el pago nunca quede descuadrado.")
                            .font(.footnote)
                            .foregroundStyle(OBColor.mutedForeground)
                    }
                }
            }
            .listRowBackground(OBColor.card)

            Section("Pago") {
                OBNumberRow(label: "Importe total", prefix: "$", placeholder: "0.00", text: $paymentText)
                DatePicker("Fecha", selection: $date, displayedComponents: .date)
                TextField("Descripción", text: $description)
                TextField("Banco o acreedor (opcional)", text: $vendor)
                Toggle("Pago recurrente", isOn: $recurring)
            }
            .listRowBackground(OBColor.card)

            Section {
                OBNumberRow(label: "Principal", prefix: "$", placeholder: "0.00", text: $principalText)
                OBNumberRow(label: "Interés", prefix: "$", placeholder: "0.00", text: $interestText)
            } header: {
                Text("Desglose protegido")
            } footer: {
                reconciliationMessage
            }
            .listRowBackground(OBColor.card)

            Section("Notas") {
                TextEditor(text: $notes)
                    .frame(minHeight: 90)
            }
            .listRowBackground(OBColor.card)

            if let failure {
                Section {
                    Text(failure).font(.footnote).foregroundStyle(OBColor.neg)
                }
                .listRowBackground(OBColor.card)
            }

            Section {
                Button(role: .destructive) {
                    confirmingDelete = true
                } label: {
                    if isDeleting {
                        ProgressView()
                    } else {
                        Label("Borrar pago completo", systemImage: "trash")
                    }
                }
                .disabled(isSaving || isDeleting)
            } footer: {
                Text("El borrado es atómico: principal e interés salen juntos.")
            }
            .listRowBackground(OBColor.card)
        }
        .formStyle(.grouped)
        .scrollContentBackground(.hidden)
        .background(OBColor.background)
        .foregroundStyle(OBColor.foreground)
        .tint(OBColor.primary)
        .onChange(of: paymentText) { next in
            reconcilePrincipal(for: next)
        }
    }

    @ViewBuilder
    private var reconciliationMessage: some View {
        if let differenceCents {
            if differenceCents == 0 {
                Text("Cuadra exactamente con el pago total.")
                    .foregroundStyle(OBColor.pos)
            } else if differenceCents > 0 {
                Text("Faltan \(Double(differenceCents) / 100, format: .currency(code: "USD").precision(.fractionLength(2))). Principal + interés debe igualar el total.")
                    .foregroundStyle(OBColor.warn)
            } else {
                Text("El desglose excede el total por \(Double(-differenceCents) / 100, format: .currency(code: "USD").precision(.fractionLength(2))).")
                    .foregroundStyle(OBColor.neg)
            }
        } else {
            Text("Escribe total, principal e interés, incluso cuando el interés sea $0.00.")
        }
    }

    private static func text(_ value: Double) -> String {
        if value == value.rounded() { return String(Int(value)) }
        return String(format: "%.2f", value)
    }

    private func load() async {
        do {
            let detail = try await repository.fetchDebtPaymentDetail(id: paymentId)
            record = detail
            date = detail.date
            description = detail.description
            vendor = detail.vendor
            principalText = Self.text(detail.principalAmount)
            interestText = Self.text(detail.interestAmount)
            paymentText = Self.text(detail.paymentAmount)
            recurring = detail.recurring
            notes = detail.notes
        } catch {
            loadFailure = (error as? LocalizedError)?.errorDescription
                ?? "No se pudo abrir el pago financiado."
        }
        isLoading = false
    }

    /// Match web: when the total changes, preserve the stated interest and put
    /// the remainder in principal. The server still validates exact cents.
    private func reconcilePrincipal(for totalText: String) {
        guard let total = OBNumber.parse(totalText),
              let interest = OBNumber.parse(interestText),
              total > 0, interest >= 0, interest <= total else { return }
        principalText = Self.text(Double(Self.cents(total) - Self.cents(interest)) / 100)
    }

    private func save() {
        guard let paymentAmount, let principalAmount, let interestAmount, canSave else { return }
        isSaving = true
        failure = nil
        Task {
            do {
                try await repository.updateDebtPayment(
                    id: paymentId,
                    DebtPaymentEdit(
                        date: date,
                        description: description.trimmingCharacters(in: .whitespaces),
                        vendor: vendor.trimmingCharacters(in: .whitespaces),
                        paymentAmount: paymentAmount,
                        principalAmount: principalAmount,
                        interestAmount: interestAmount,
                        recurring: recurring,
                        notes: notes.trimmingCharacters(in: .whitespacesAndNewlines)
                    )
                )
                onSaved()
                dismiss()
            } catch {
                failure = (error as? LocalizedError)?.errorDescription
                    ?? "No se pudo guardar el pago completo."
                isSaving = false
            }
        }
    }

    private func deletePayment() {
        isDeleting = true
        failure = nil
        Task {
            do {
                try await repository.deleteDebtPayment(id: paymentId)
                onSaved()
                dismiss()
            } catch {
                failure = (error as? LocalizedError)?.errorDescription
                    ?? "No se pudo borrar el pago completo."
                isDeleting = false
            }
        }
    }
}
