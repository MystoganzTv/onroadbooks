import SwiftUI

/// Record a load from the cab -- with the same shortcuts the web form has.
///
/// It used to ask only for where, how far and for how much, which left the
/// owner typing everything else on a laptop later. Now: scan the rate con and
/// it fills itself; pick the broker and the person you booked with from your
/// own list; dispatch and factoring start at the rates of your latest load
/// (as % of the rate, like the web), and the details a rate con carries --
/// delivery date, weight, commodity -- have a place.
///
/// Nothing here re-implements a rule: the server validates with the same
/// `loadSchema` the browser posts through, so a refusal is the product's own
/// judgement, not a phone-shaped copy of it.
struct AddLoadView: View {
    let repository: LedgerRepository
    let onSaved: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var options = LoadFormOptions.empty
    @State private var loadNumber = ""
    @State private var date = Date()
    @State private var hasDelivery = false
    @State private var deliveryDate = Date()
    @State private var broker = ""
    @State private var brokerContact = ""
    @State private var originCity = ""
    @State private var originState = ""
    @State private var destinationCity = ""
    @State private var destinationState = ""
    @State private var rateText = ""
    @State private var loadedText = ""
    @State private var deadheadText = ""
    @State private var dispatchText = ""
    @State private var dispatchIsPercent = true
    @State private var factoringText = ""
    @State private var factoringIsPercent = true
    @State private var showDetails = false
    @State private var weightText = ""
    @State private var commodity = ""
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
                RateConImport(repository: repository, onRead: apply)
                    .listRowBackground(OBColor.card)

                // The PO is the load's identifier -- the lane repeats, the PO
                // never does -- so it is the first field.
                Section {
                    OBPONumberField(text: $loadNumber)
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

                Section("Origen") {
                    TextField("Ciudad", text: $originCity)
                    OBStateField(text: $originState)
                }
                .listRowBackground(OBColor.card)

                Section("Destino") {
                    TextField("Ciudad", text: $destinationCity)
                    OBStateField(text: $destinationState)
                }
                .listRowBackground(OBColor.card)

                Section("Fechas") {
                    DatePicker("Recogida", selection: $date, displayedComponents: .date)
                    OBOptionalDateRow(label: "Entrega", isOn: $hasDelivery, date: $deliveryDate, minimum: date)
                }
                .listRowBackground(OBColor.card)

                Section("Broker") {
                    OBBrokerFields(broker: $broker, contact: $brokerContact, brokers: options.brokers)
                }
                .listRowBackground(OBColor.card)

                Section {
                    OBFeeRow(label: "Dispatch", text: $dispatchText, isPercent: $dispatchIsPercent, rate: rate)
                    OBFeeRow(label: "Factoring", text: $factoringText, isPercent: $factoringIsPercent, rate: rate)
                } header: {
                    Text("Dispatch y factoring")
                } footer: {
                    if options.dispatchPct != nil || options.factoringPct != nil {
                        Text("Empiezan con los porcentajes de tu última carga.")
                            .foregroundStyle(OBColor.mutedForeground)
                    }
                }
                .listRowBackground(OBColor.card)

                Section {
                    DisclosureGroup("Detalles de la carga", isExpanded: $showDetails) {
                        OBNumberRow(label: "Peso", suffix: "lb", placeholder: "0", text: $weightText)
                        TextField("Mercancía", text: $commodity)
                    }
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
            .scrollDismissesKeyboard(.interactively)
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
            .task { await loadOptions() }
        }
    }

    /// Brokers and fee rates. A failure here costs typing, never the form.
    private func loadOptions() async {
        guard let fetched = try? await repository.fetchLoadFormOptions() else { return }
        options = fetched
        if dispatchText.isEmpty, let pct = fetched.dispatchPct, pct > 0 { dispatchText = LoadFees.text(pct) }
        if factoringText.isEmpty, let pct = fetched.factoringPct, pct > 0 { factoringText = LoadFees.text(pct) }
    }

    /// What the rate con said. The owner still checks every field before saving.
    private func apply(_ fields: [String: String]) {
        func value(_ key: String) -> String? {
            guard let raw = fields[key]?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else { return nil }
            return raw
        }
        if let v = value("loadNumber") { loadNumber = v }
        if let v = value("broker") { broker = v }
        if let v = value("brokerContact") { brokerContact = v }
        if let v = value("date") { date = ISODate.parse(v) }
        if let v = value("deliveryDate") { deliveryDate = ISODate.parse(v); hasDelivery = true }
        if let v = value("originCity") { originCity = v }
        if let v = value("originState") { originState = String(v.uppercased().prefix(2)) }
        if let v = value("destinationCity") { destinationCity = v }
        if let v = value("destinationState") { destinationState = String(v.uppercased().prefix(2)) }
        if let v = value("grossRate") { rateText = v }
        if let v = value("loadedMiles") { loadedText = v }
        if let v = value("weightLbs") { weightText = v; showDetails = true }
        if let v = value("commodity") { commodity = v; showDetails = true }
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
                        otherExpenses: OBNumber.parse(otherText) ?? 0,
                        loadNumber: loadNumber.trimmingCharacters(in: .whitespacesAndNewlines),
                        brokerContact: brokerContact,
                        deliveryDate: hasDelivery ? max(deliveryDate, date) : nil,
                        weightLbs: OBNumber.parse(weightText),
                        commodity: commodity,
                        dispatchFee: LoadFees.dollars(dispatchText, isPercent: dispatchIsPercent, rate: rate),
                        factoringFee: LoadFees.dollars(factoringText, isPercent: factoringIsPercent, rate: rate)
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

// MARK: - Load form pieces, shared by AddLoadView and LoadDetailView

/// "#" then the PO or load number (TQL says PO, Curri says load number).
struct OBPONumberField: View {
    @Binding var text: String

    var body: some View {
        HStack {
            Text("#").foregroundStyle(OBColor.mutedForeground)
            TextField("PO / número de carga", text: $text)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .font(.body.weight(.semibold))
                .monospacedDigit()
        }
        .frame(minHeight: 44)
    }
}

/// Two capital letters, nothing else.
struct OBStateField: View {
    @Binding var text: String

    var body: some View {
        TextField("Estado (2 letras)", text: $text)
            .textInputAutocapitalization(.characters)
            .autocorrectionDisabled()
            .onChange(of: text) { value in
                let clipped = String(value.uppercased().filter { $0.isLetter }.prefix(2))
                if clipped != value { text = clipped }
            }
    }
}

/// A date that may not be known yet (delivery): a switch, then the picker.
struct OBOptionalDateRow: View {
    let label: String
    @Binding var isOn: Bool
    @Binding var date: Date
    var minimum: Date? = nil

    var body: some View {
        Toggle(label, isOn: $isOn)
            .frame(minHeight: 44)
        if isOn {
            if let minimum {
                DatePicker("Fecha de \(label.lowercased())", selection: $date, in: minimum..., displayedComponents: .date)
            } else {
                DatePicker("Fecha de \(label.lowercased())", selection: $date, displayedComponents: .date)
            }
        }
    }
}

/// Broker and the person booked with: type, or pick from the owner's own list.
/// Picking a broker with a single known contact fills the contact too.
struct OBBrokerFields: View {
    @Binding var broker: String
    @Binding var contact: String
    let brokers: [LoadFormOptions.Broker]

    private var contacts: [String] {
        let key = broker.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return brokers.first { $0.name.lowercased() == key }?.contacts ?? []
    }

    var body: some View {
        HStack {
            TextField("Broker", text: $broker)
                .autocorrectionDisabled()
            if !brokers.isEmpty {
                Menu {
                    ForEach(brokers) { option in
                        Button(option.name) {
                            broker = option.name
                            if !option.contacts.contains(contact) {
                                contact = option.contacts.count == 1 ? option.contacts[0] : ""
                            }
                        }
                    }
                } label: {
                    Image(systemName: "chevron.up.chevron.down")
                        .frame(minWidth: 44, minHeight: 44)
                }
                .accessibilityLabel(Text("Elegir broker"))
            }
        }
        HStack {
            TextField("Contacto (con quién reservaste)", text: $contact)
                .autocorrectionDisabled()
            if !contacts.isEmpty {
                Menu {
                    ForEach(contacts, id: \.self) { name in
                        Button(name) { contact = name }
                    }
                } label: {
                    Image(systemName: "chevron.up.chevron.down")
                        .frame(minWidth: 44, minHeight: 44)
                }
                .accessibilityLabel(Text("Elegir contacto"))
            }
        }
    }
}

/// Dispatch or factoring, typed as % of the rate or as dollars, like the web.
/// Switching the unit converts the value instead of reinterpreting it.
struct OBFeeRow: View {
    let label: String
    @Binding var text: String
    @Binding var isPercent: Bool
    let rate: Double?

    private var dollars: Double { LoadFees.dollars(text, isPercent: isPercent, rate: rate) }

    private var unit: Binding<Bool> {
        Binding(
            get: { isPercent },
            set: { percent in
                guard percent != isPercent else { return }
                let amount = dollars
                if percent {
                    if let rate, rate > 0, amount > 0 {
                        text = LoadFees.text((amount / rate * 10_000).rounded() / 100)
                    }
                } else {
                    text = LoadFees.text(amount)
                }
                isPercent = percent
            }
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: OBSpacing.sm) {
                OBNumberRow(label: label, prefix: isPercent ? nil : "$", suffix: isPercent ? "%" : nil,
                            placeholder: "0", text: $text)
                Picker(label, selection: unit) {
                    Text("%").tag(true)
                    Text("$").tag(false)
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .frame(width: 88)
            }
            if isPercent, dollars > 0 {
                Text("= \(dollars, format: .currency(code: "USD"))")
                    .font(.caption)
                    .foregroundStyle(OBColor.mutedForeground)
            }
        }
    }
}
