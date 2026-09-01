import SwiftUI
import UIKit

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
    @State private var receipt: UIImage?
    @State private var pickerSource: ReceiptPicker.Source?
    @State private var choosingSource = false
    /// Shown instead of the form once the expense is saved but something about
    /// the receipt needs saying.
    @State private var notice: String?

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

                Section {
                    if let receipt {
                        HStack(spacing: OBSpacing.md) {
                            Image(uiImage: receipt)
                                .resizable()
                                .scaledToFill()
                                .frame(width: 54, height: 54)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                            Text("Recibo adjunto")
                                .font(.subheadline)
                                .foregroundStyle(OBColor.foreground)
                            Spacer()
                            Button("Quitar") { self.receipt = nil }
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(OBColor.neg)
                                .buttonStyle(.plain)
                        }
                    } else {
                        Button {
                            choosingSource = true
                        } label: {
                            Label("Adjuntar recibo", systemImage: "camera.fill")
                                .foregroundStyle(OBColor.primary)
                        }
                    }
                } footer: {
                    Text("Se guarda junto al gasto, igual que en la web. Necesita señal: una foto no puede adjuntarse a un gasto que todavía no llegó al ledger.")
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
            .confirmationDialog("Recibo", isPresented: $choosingSource, titleVisibility: .hidden) {
                Button("Tomar foto") { pickerSource = .camera }
                Button("Elegir de Fotos") { pickerSource = .library }
                Button("Cancelar", role: .cancel) {}
            }
            .sheet(item: $pickerSource) { source in
                ReceiptPicker(source: source) { image in receipt = image }
                    .ignoresSafeArea()
            }
            .alert("Gasto guardado", isPresented: Binding(
                get: { notice != nil },
                set: { if !$0 { notice = nil; dismiss() } }
            )) {
                Button("Entendido") { notice = nil; dismiss() }
            } message: {
                Text(notice ?? "")
            }
        }
    }

    private func save() {
        guard let amount, canSave else { return }
        isSaving = true
        failure = nil
        Task {
            do {
                let expenseId = try await repository.createExpense(
                    NewExpense(
                        date: date,
                        categoryId: categoryId,
                        detail: detail.trimmingCharacters(in: .whitespaces),
                        vendor: vendor.trimmingCharacters(in: .whitespaces),
                        amount: amount
                    )
                )
                onSaved()

                if let receipt {
                    // A queued expense has no id in the ledger yet, so there is
                    // nothing for a photo to hang on. Say that instead of
                    // dropping the receipt quietly.
                    guard !expenseId.hasPrefix("pendiente:") else {
                        isSaving = false
                        notice = "Se guardó sin señal y se enviará solo. El recibo no se pudo adjuntar: añádelo desde la web cuando llegues."
                        return
                    }
                    guard let jpeg = receipt.receiptJPEG() else {
                        isSaving = false
                        notice = "El gasto quedó registrado, pero no se pudo preparar la foto."
                        return
                    }
                    do {
                        try await repository.attachReceipt(expenseId: expenseId, jpeg: jpeg)
                    } catch {
                        isSaving = false
                        notice = "El gasto quedó registrado. El recibo no subió: "
                            + ((error as? LocalizedError)?.errorDescription ?? "inténtalo desde la web.")
                        return
                    }
                }

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
