import SwiftUI

/// Record a load from the cab.
///
/// The web form can set two dozen fields; this asks for the ones you know when
/// the load is booked -- where, how far, for how much -- and lets the rest keep
/// their defaults. Trip costs are optional and start collapsed, because fuel is
/// usually a receipt you do not have yet.
///
/// Nothing here re-implements a rule: the server validates with the same
/// `loadSchema` the browser posts through, so a refusal is the product's own
/// judgement, not a phone-shaped copy of it.
struct AddLoadView: View {
    let repository: LedgerRepository
    let onSaved: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var date = Date()
    @State private var broker = ""
    @State private var originCity = ""
    @State private var originState = ""
    @State private var destinationCity = ""
    @State private var destinationState = ""
    @State private var rateText = ""
    @State private var loadedText = ""
    @State private var deadheadText = ""
    @State private var showCosts = false
    @State private var fuelText = ""
    @State private var tollsText = ""
    @State private var otherText = ""
    @State private var isSaving = false
    @State private var failure: String?

    private var rate: Double? { OBNumber.parse(rateText) }
    private var loadedMiles: Double? { OBNumber.parse(loadedText) }

    private var canSave: Bool {
        !originCity.trimmingCharacters(in: .whitespaces).isEmpty
            && !destinationCity.trimmingCharacters(in: .whitespaces).isEmpty
            && originState.count == 2
            && destinationState.count == 2
            && (rate ?? 0) > 0
            && (loadedMiles ?? 0) >= 1
    }

    /// Shown live while typing, because the number that decides whether to take
    /// a load is the one per mile, not the one the broker says out loud.
    private var ratePerMile: Double? {
        guard let rate, let loadedMiles, loadedMiles > 0 else { return nil }
        let total = loadedMiles + (OBNumber.parse(deadheadText) ?? 0)
        return total > 0 ? rate / total : nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    OBNumberRow(label: "Tarifa", prefix: "$", placeholder: "0.00", text: $rateText)
                    OBNumberRow(label: "Millas cargadas", text: $loadedText)
                    OBNumberRow(label: "Millas vacías", text: $deadheadText)
                } footer: {
                    if let ratePerMile {
                        Text("\(ratePerMile, format: .currency(code: "USD").precision(.fractionLength(2))) por milla, vacías incluidas.")
                            .foregroundStyle(OBColor.mutedForeground)
                    }
                }
                .listRowBackground(OBColor.card)

                Section("Origen") {
                    TextField("Ciudad", text: $originCity)
                    stateField(text: $originState)
                }
                .listRowBackground(OBColor.card)

                Section("Destino") {
                    TextField("Ciudad", text: $destinationCity)
                    stateField(text: $destinationState)
                }
                .listRowBackground(OBColor.card)

                Section {
                    DatePicker("Fecha", selection: $date, displayedComponents: .date)
                    TextField("Broker (opcional)", text: $broker)
                }
                .listRowBackground(OBColor.card)

                Section {
                    DisclosureGroup("Costos del viaje", isExpanded: $showCosts) {
                        OBNumberRow(label: "Combustible", prefix: "$", placeholder: "0.00", text: $fuelText)
                        OBNumberRow(label: "Peajes", prefix: "$", placeholder: "0.00", text: $tollsText)
                        OBNumberRow(label: "Otros", prefix: "$", placeholder: "0.00", text: $otherText)
                    }
                } footer: {
                    Text("Opcional. El combustible casi siempre es un recibo que todavía no tienes.")
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
            .formStyle(.grouped)
            .scrollContentBackground(.hidden)
            .background(OBColor.background)
            .foregroundStyle(OBColor.foreground)
            .tint(OBColor.primary)
            .navigationTitle("Nuevo load")
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

    private func stateField(text: Binding<String>) -> some View {
        TextField("Estado (2 letras)", text: text)
            .textInputAutocapitalization(.characters)
            .autocorrectionDisabled()
            .onChange(of: text.wrappedValue) { value in
                let letters = value.uppercased().filter { $0.isLetter }
                let clipped = String(letters.prefix(2))
                if clipped != value { text.wrappedValue = clipped }
            }
    }

    private func save() {
        guard let rate, let loadedMiles, canSave else { return }
        isSaving = true
        failure = nil
        Task {
            do {
                try await repository.createLoad(
                    NewLoad(
                        date: date,
                        broker: broker.trimmingCharacters(in: .whitespaces),
                        originCity: originCity.trimmingCharacters(in: .whitespaces),
                        originState: originState,
                        destinationCity: destinationCity.trimmingCharacters(in: .whitespaces),
                        destinationState: destinationState,
                        grossRate: rate,
                        loadedMiles: loadedMiles,
                        deadheadMiles: OBNumber.parse(deadheadText) ?? 0,
                        fuelCost: OBNumber.parse(fuelText) ?? 0,
                        tolls: OBNumber.parse(tollsText) ?? 0,
                        otherExpenses: OBNumber.parse(otherText) ?? 0
                    )
                )
                onSaved()
                dismiss()
            } catch {
                failure = (error as? LocalizedError)?.errorDescription ?? "No se pudo guardar el load."
                isSaving = false
            }
        }
    }
}
