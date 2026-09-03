import SwiftUI

/// Correct a gasto already in the books.
///
/// The same four fields Add asks for, because the rest — scope, truck, linked
/// load, recurring, receipt number — is set up on the web and merged back in
/// by the server, untouched.
///
/// A row the app wrote for you (a fuel or service mirror, a load's posted trip
/// cost) opens read-only and says where to change it instead. That refusal is
/// the server's own sentence: it knows which source wrote the row.
struct EditExpenseView: View {
    let repository: LedgerRepository
    let expenseId: String
    let categories: [ExpenseCategory]
    let onSaved: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var detailRecord: ExpenseDetail?
    @State private var isLoading = true
    @State private var loadFailure: String?

    @State private var date = Date()
    @State private var categoryId = ""
    @State private var detail = ""
    @State private var vendor = ""
    @State private var amountText = ""
    @State private var isSaving = false
    @State private var failure: String?

    private var amount: Double? { OBNumber.parse(amountText) }
    private var readOnly: Bool { detailRecord?.readOnly ?? false }

    private var canSave: Bool {
        !readOnly
            && !categoryId.isEmpty
            && !detail.trimmingCharacters(in: .whitespaces).isEmpty
            && (amount ?? 0) > 0
            && !isSaving
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
            .navigationTitle("Editar gasto")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView().tint(OBColor.primary)
                    } else if !readOnly {
                        Button("Guardar", action: save).disabled(!canSave)
                    }
                }
            }
            .task { await load() }
        }
    }

    private var form: some View {
        Form {
            if let reason = detailRecord?.readOnlyReason {
                Section {
                    HStack(alignment: .top, spacing: OBSpacing.sm) {
                        Image(systemName: "lock.fill")
                            .foregroundStyle(OBColor.mutedForeground)
                        Text(reason)
                            .font(.footnote)
                            .foregroundStyle(OBColor.mutedForeground)
                    }
                }
                .listRowBackground(OBColor.card)
            }

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
            .disabled(readOnly)

            Section {
                TextField("Descripción", text: $detail)
                TextField("Proveedor (opcional)", text: $vendor)
            }
            .listRowBackground(OBColor.card)
            .disabled(readOnly)

            if let failure {
                Section {
                    Text(failure).font(.footnote).foregroundStyle(OBColor.neg)
                }
                .listRowBackground(OBColor.card)
            }
        }
        .formStyle(.grouped)
        .scrollContentBackground(.hidden)
        .background(OBColor.background)
        .foregroundStyle(OBColor.foreground)
        .tint(OBColor.primary)
    }

    private static func text(_ value: Double) -> String {
        guard value != 0 else { return "" }
        if value == value.rounded() { return String(Int(value)) }
        var text = String(format: "%.2f", value)
        while text.contains(".") && (text.hasSuffix("0") || text.hasSuffix(".")) { text.removeLast() }
        return text
    }

    private func load() async {
        do {
            let record = try await repository.fetchExpenseDetail(id: expenseId)
            detailRecord = record
            date = record.date
            categoryId = record.categoryId
            detail = record.detail
            vendor = record.vendor
            amountText = Self.text(record.amount)
        } catch {
            loadFailure = (error as? LocalizedError)?.errorDescription ?? "No se pudo abrir este gasto."
        }
        isLoading = false
    }

    private func save() {
        guard let amount, canSave else { return }
        isSaving = true
        failure = nil
        Task {
            do {
                try await repository.updateExpense(
                    id: expenseId,
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
                failure = (error as? LocalizedError)?.errorDescription ?? "No se pudo guardar el cambio."
                isSaving = false
            }
        }
    }
}
