import SwiftUI

/// Move money into or out of a bucket, by hand.
///
/// Closing a half-month posts contributions automatically; this is for
/// everything else — paying the quarterly estimate out of Tax, dropping a
/// windfall into Maintenance, correcting a month you under-saved.
///
/// A balance here is always the signed sum of its movements. There is no
/// stored balance to edit, which is why a mistake is fixed by posting the
/// opposite movement rather than by rewriting history.
struct ReserveMovementView: View {
    let repository: LedgerRepository
    let buckets: [ReserveBucket]
    let onSaved: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var accountId: String
    @State private var type = "WITHDRAWAL"
    @State private var date = Date()
    @State private var amountText = ""
    @State private var reason = ""
    @State private var isSaving = false
    @State private var failure: String?

    init(repository: LedgerRepository, buckets: [ReserveBucket], onSaved: @escaping () -> Void) {
        self.repository = repository
        self.buckets = buckets
        self.onSaved = onSaved
        _accountId = State(initialValue: buckets.first?.id ?? "")
    }

    private var amount: Double? { OBNumber.parse(amountText) }
    private var bucket: ReserveBucket? { buckets.first { $0.id == accountId } }

    private var canSave: Bool {
        !accountId.isEmpty
            && (amount ?? 0) > 0
            && !reason.trimmingCharacters(in: .whitespaces).isEmpty
            && !isSaving
    }

    /// What the bucket will hold afterwards — the number the owner is actually
    /// deciding about.
    private var resultingBalance: Double? {
        guard let bucket, let amount else { return nil }
        return type == "WITHDRAWAL" ? bucket.balance - amount : bucket.balance + amount
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Cubeta", selection: $accountId) {
                        ForEach(buckets) { bucket in
                            Text(bucket.name).tag(bucket.id)
                        }
                    }
                    Picker("Movimiento", selection: $type) {
                        Text("Sacar").tag("WITHDRAWAL")
                        Text("Aportar").tag("CONTRIBUTION")
                    }
                    .pickerStyle(.segmented)
                    OBNumberRow(label: "Monto", prefix: "$", placeholder: "0.00", text: $amountText)
                    DatePicker("Fecha", selection: $date, displayedComponents: .date)
                } footer: {
                    if let bucket, let resultingBalance {
                        Text("\(bucket.name) quedaría en \(resultingBalance, format: .currency(code: "USD").precision(.fractionLength(2))).")
                            .foregroundStyle(resultingBalance < 0 ? OBColor.warn : OBColor.mutedForeground)
                    }
                }
                .listRowBackground(OBColor.card)

                Section {
                    TextField("Para qué", text: $reason)
                } footer: {
                    // "por qué salió ese dinero" only makes sense for a
                    // withdrawal -- a contribution needs the mirror sentence,
                    // not a line that describes money leaving the bucket.
                    Text(type == "WITHDRAWAL"
                        ? "Dentro de seis meses esta línea es lo único que explica por qué salió ese dinero."
                        : "Dentro de seis meses esta línea es lo único que explica de dónde salió este dinero.")
                        .foregroundStyle(OBColor.mutedForeground)
                }
                .listRowBackground(OBColor.card)

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
            .navigationTitle("Movimiento")
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
        }
    }

    private func save() {
        guard let amount, canSave else { return }
        isSaving = true
        failure = nil
        Task {
            do {
                try await repository.recordReserveMovement(
                    ReserveMovementInput(
                        accountId: accountId,
                        date: date,
                        type: type,
                        amount: amount,
                        description: reason.trimmingCharacters(in: .whitespaces)
                    )
                )
                onSaved()
                dismiss()
            } catch {
                failure = (error as? LocalizedError)?.errorDescription ?? "No se pudo registrar el movimiento."
                isSaving = false
            }
        }
    }
}
