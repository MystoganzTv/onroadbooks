import SwiftUI

/// Fix a load without finding a laptop.
///
/// The app could add a load from the cab but not correct one, and a mistyped
/// rate is not a cosmetic problem: it moves the load's own rating, the true
/// cost per mile, and through that the Safe to Pay figure on the dashboard.
///
/// What this screen does NOT show — dispatch and factoring fees, the
/// equipment, the commodity, the IFTA jurisdiction miles — is merged in by
/// the server and comes back untouched. A phone is a smaller window onto the
/// record, not a smaller record.
struct LoadDetailView: View {
    let repository: LedgerRepository
    let loadId: String
    let onChanged: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var detail: LoadDetail?
    @State private var isLoading = true
    @State private var loadFailure: String?

    @State private var date = Date()
    @State private var broker = ""
    @State private var originCity = ""
    @State private var originState = ""
    @State private var destinationCity = ""
    @State private var destinationState = ""
    @State private var rateText = ""
    @State private var loadedText = ""
    @State private var deadheadText = ""
    @State private var fuelText = ""
    @State private var tollsText = ""
    @State private var otherText = ""

    @State private var isSaving = false
    @State private var isDeleting = false
    @State private var confirmingDelete = false
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
            && !isSaving
            && !isDeleting
    }

    /// The number that decides whether the load was worth taking, live while
    /// the correction is being typed.
    private var ratePerMile: Double? {
        guard let rate, let loadedMiles, loadedMiles > 0 else { return nil }
        let total = loadedMiles + (OBNumber.parse(deadheadText) ?? 0)
        return total > 0 ? rate / total : nil
    }

    var body: some View {
        Group {
            if isLoading {
                ProgressView().tint(OBColor.primary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let loadFailure {
                VStack(spacing: OBSpacing.sm) {
                    Text(loadFailure)
                        .font(.subheadline)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(OBColor.mutedForeground)
                        .padding(.horizontal, OBSpacing.lg)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                form
            }
        }
        .background(OBColor.background)
        .navigationTitle("Load")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private var form: some View {
        Form {
            Section {
                DatePicker("Fecha", selection: $date, displayedComponents: .date)
                TextField("Broker", text: $broker)
            }
            .listRowBackground(OBColor.card)

            Section("Ruta") {
                TextField("Ciudad de origen", text: $originCity)
                stateField(text: $originState)
                TextField("Ciudad de destino", text: $destinationCity)
                stateField(text: $destinationState)
            }
            .listRowBackground(OBColor.card)

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

            Section("Costos del viaje") {
                OBNumberRow(label: "Combustible", prefix: "$", placeholder: "0.00", text: $fuelText)
                OBNumberRow(label: "Peajes", prefix: "$", placeholder: "0.00", text: $tollsText)
                OBNumberRow(label: "Otros", prefix: "$", placeholder: "0.00", text: $otherText)
            }
            .listRowBackground(OBColor.card)

            if let detail, let invoiceNumber = detail.invoiceNumber, !invoiceNumber.isEmpty {
                Section {
                    Text("Factura \(invoiceNumber) emitida. Cambiar la tarifa aquí no cambia lo ya facturado.")
                        .font(.footnote)
                        .foregroundStyle(OBColor.mutedForeground)
                }
                .listRowBackground(OBColor.card)
            }

            if let failure {
                Section {
                    Text(failure)
                        .font(.footnote)
                        .foregroundStyle(OBColor.neg)
                }
                .listRowBackground(OBColor.card)
            }

            Section {
                Button(role: .destructive) {
                    confirmingDelete = true
                } label: {
                    HStack {
                        Spacer()
                        Text(isDeleting ? "Borrando…" : "Borrar este load")
                        Spacer()
                    }
                }
                .disabled(isSaving || isDeleting)
            } footer: {
                Text("Los gastos y el combustible que le apuntan NO se borran: quedan sueltos en el libro, porque el dinero gastado se gastó.")
                    .foregroundStyle(OBColor.mutedForeground)
            }
            .listRowBackground(OBColor.card)
        }
        .formStyle(.grouped)
        .scrollContentBackground(.hidden)
        .background(OBColor.background)
        .foregroundStyle(OBColor.foreground)
        .tint(OBColor.primary)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                if isSaving {
                    ProgressView().tint(OBColor.primary)
                } else {
                    Button("Guardar", action: save).disabled(!canSave)
                }
            }
        }
        .confirmationDialog(
            "¿Borrar este load?",
            isPresented: $confirmingDelete,
            titleVisibility: .visible
        ) {
            Button("Borrar", role: .destructive) { delete() }
            Button("Cancelar", role: .cancel) {}
        } message: {
            Text("Se va del libro con su tarifa y sus millas. Los gastos y el combustible enlazados se conservan, sin carga.")
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

    private static func text(_ value: Double) -> String {
        guard value != 0 else { return "" }
        if value == value.rounded() { return String(Int(value)) }
        var text = String(format: "%.2f", value)
        while text.contains(".") && (text.hasSuffix("0") || text.hasSuffix(".")) {
            text.removeLast()
        }
        return text
    }

    private func load() async {
        do {
            let record = try await repository.fetchLoadDetail(id: loadId)
            detail = record
            date = record.date
            broker = record.broker
            originCity = record.originCity
            originState = record.originState
            destinationCity = record.destinationCity
            destinationState = record.destinationState
            rateText = Self.text(record.grossRate)
            loadedText = Self.text(record.loadedMiles)
            deadheadText = Self.text(record.deadheadMiles)
            fuelText = Self.text(record.fuelCost)
            tollsText = Self.text(record.tolls)
            otherText = Self.text(record.otherExpenses)
            loadFailure = nil
        } catch {
            loadFailure = (error as? LocalizedError)?.errorDescription ?? "No se pudo abrir este load."
        }
        isLoading = false
    }

    private func save() {
        guard let rate, let loadedMiles, canSave else { return }
        isSaving = true
        failure = nil
        Task {
            do {
                try await repository.updateLoad(
                    id: loadId,
                    LoadEdit(
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
                onChanged()
                dismiss()
            } catch {
                failure = (error as? LocalizedError)?.errorDescription ?? "No se pudo guardar el cambio."
                isSaving = false
            }
        }
    }

    private func delete() {
        isDeleting = true
        failure = nil
        Task {
            do {
                try await repository.deleteLoad(id: loadId)
                onChanged()
                dismiss()
            } catch {
                failure = (error as? LocalizedError)?.errorDescription ?? "No se pudo borrar el load."
                isDeleting = false
            }
        }
    }
}
