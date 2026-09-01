import SwiftUI

/// A fill-up, entered at the pump.
///
/// The total is computed from gallons × price as you type, because that is the
/// arithmetic nobody wants to do one-handed — but the moment you touch it, the
/// receipt wins and the app stops overwriting you. Taxes and rounding mean the
/// printed total is often not exactly the product.
///
/// The odometer is the field worth nagging about: without two readings on the
/// same truck there is no MPG at all, so the form says so rather than letting
/// it look optional-and-unimportant.
struct AddFuelView: View {
    let repository: LedgerRepository
    let onSaved: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var date = Date()
    @State private var gallonsText = ""
    @State private var priceText = ""
    @State private var totalText = ""
    @State private var totalEdited = false
    /// The last value this form wrote into `totalText` itself. Anything else
    /// appearing there came from a thumb, and a thumb outranks the arithmetic.
    @State private var lastAutoFill = ""
    @State private var odometerText = ""
    @State private var location = ""
    @State private var jurisdiction = ""
    @State private var isSaving = false
    @State private var failure: String?

    private var gallons: Double? { OBNumber.parse(gallonsText) }
    private var price: Double? { OBNumber.parse(priceText) }
    private var total: Double? { OBNumber.parse(totalText) }

    private var canSave: Bool {
        (gallons ?? 0) >= 0.1 && (price ?? 0) >= 0.01 && (total ?? 0) >= 0.01
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    OBNumberRow(label: "Galones", placeholder: "0.0", text: $gallonsText)
                    OBNumberRow(label: "Precio / galón", prefix: "$", placeholder: "0.000", text: $priceText)
                    OBNumberRow(label: "Total", prefix: "$", placeholder: "0.00", text: $totalText)
                } footer: {
                    Text(totalEdited
                         ? "Usando el total del recibo."
                         : "El total se calcula solo; edítalo si el recibo dice otra cosa.")
                        .foregroundStyle(OBColor.mutedForeground)
                }
                .listRowBackground(OBColor.card)

                Section {
                    OBNumberRow(label: "Odómetro", placeholder: "0", text: $odometerText)
                } footer: {
                    Text("Sin dos lecturas del odómetro en el mismo camión no hay MPG que calcular.")
                        .foregroundStyle(OBColor.mutedForeground)
                }
                .listRowBackground(OBColor.card)

                Section {
                    DatePicker("Fecha", selection: $date, displayedComponents: .date)
                    TextField("Lugar (opcional)", text: $location)
                    TextField("Estado IFTA (opcional)", text: $jurisdiction)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .onChange(of: jurisdiction) { value in
                            let clipped = String(value.uppercased().filter { $0.isLetter }.prefix(2))
                            if clipped != value { jurisdiction = clipped }
                        }
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
            .navigationTitle("Nueva carga")
            .navigationBarTitleDisplayMode(.inline)
            .onChange(of: gallonsText) { _ in recomputeTotal() }
            .onChange(of: priceText) { _ in recomputeTotal() }
            .onChange(of: totalText) { value in
                if value != lastAutoFill { totalEdited = true }
            }
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

    private func computedTotal() -> String? {
        guard let gallons, let price, gallons > 0, price > 0 else { return nil }
        return String(format: "%.2f", gallons * price)
    }

    private func recomputeTotal() {
        guard !totalEdited, let computed = computedTotal() else { return }
        lastAutoFill = computed
        totalText = computed
    }

    private func save() {
        guard let gallons, let price, let total, canSave else { return }
        isSaving = true
        failure = nil
        Task {
            do {
                try await repository.createFuelStop(
                    NewFuelStop(
                        date: date,
                        gallons: gallons,
                        pricePerGallon: price,
                        totalCost: total,
                        odometer: OBNumber.parse(odometerText).map { Int($0) },
                        location: location.trimmingCharacters(in: .whitespaces),
                        jurisdiction: jurisdiction
                    )
                )
                onSaved()
                dismiss()
            } catch {
                failure = (error as? LocalizedError)?.errorDescription ?? "No se pudo guardar la carga."
                isSaving = false
            }
        }
    }
}
