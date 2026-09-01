import SwiftUI

/// The receipt in your hand, before it becomes a shoebox.
///
/// Four fields and a save: everything else an expense can carry (scope, truck,
/// linked load, recurring) is set up once on the web and would only slow down
/// the thing this screen exists for, which is entering a number at a pump
/// before pulling out.
struct AddExpenseView: View {
    let repository: LedgerRepository
    let categories: [ExpenseCategory]
    let onSaved: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var date = Date()
    @State private var categoryId = ""
    @State private var detail = ""
    @State private var vendor = ""
    @State private var amountText = ""
    @State private var isSaving = false
    @State private var failure: String?

    private var amount: Double? { OBNumber.parse(amountText) }

    private var canSave: Bool {
        !categoryId.isEmpty
            && !detail.trimmingCharacters(in: .whitespaces).isEmpty
            && (amount ?? 0) > 0
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    OBNumberRow(label: "Monto", prefix: "$", placeholder: "0.00", text: $amountText)

                    Picker("Categoría", selection: $categoryId) {
                        ForEach(categories) { category in
                            Text(category.label).tag(category.id)
                        }
                    }

                    DatePicker("Fecha", selection: $date, displayedComponents: .date)
                }
                .listRowBackground(OBColor.card)

                Section {
                    TextField("Descripción", text: $detail)
                    TextField("Proveedor (opcional)", text: $vendor)
                } footer: {
                    Text("La descripción es lo que verás en el ledger dentro de seis meses.")
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
            .navigationTitle("Nuevo gasto")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView().tint(OBColor.primary)
                    } else {
                        Button("Guardar", action: save).disabled(!canSave)
                    }
                }
            }
            .onAppear {
                if categoryId.isEmpty { categoryId = categories.first?.id ?? "" }
            }
        }
    }

    private func save() {
        guard let amount, canSave else { return }
        isSaving = true
        failure = nil
        Task {
            do {
                try await repository.createExpense(
                    NewExpense(
                        date: date,
                        categoryId: categoryId,
                        detail: detail.trimmingCharacters(in: .whitespaces),
                        vendor: vendor.trimmingCharacters(in: .whitespaces),
                        amount: amount
                    )
                )
                onSaved()
                dismiss()
            } catch {
                // The server writes its refusals for the owner -- an expired
                // trial, a role without permission. Show that sentence.
                failure = (error as? LocalizedError)?.errorDescription ?? "No se pudo guardar el gasto."
                isSaving = false
            }
        }
    }
}
