import SwiftUI

/// Correct a fill-up — the record most likely to be typed wrong in the first
/// place, standing at the pump with the engine running.
///
/// Editing the ENTRY is what keeps its mirrored FUEL row in the ledger in
/// step. That is why the ledger row itself refuses to be edited: there is one
/// place to change this, and it is here.
struct EditFuelView: View {
    let repository: LedgerRepository
    let fuelId: String
    let onSaved: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var isLoading = true
    @State private var loadFailure: String?

    @State private var date = Date()
    @State private var gallonsText = ""
    @State private var priceText = ""
    @State private var totalText = ""
    @State private var odometerText = ""
    @State private var location = ""
    @State private var jurisdiction = ""
    @State private var isSaving = false
    @State private var failure: String?

    private var gallons: Double? { OBNumber.parse(gallonsText) }
    private var price: Double? { OBNumber.parse(priceText) }
    private var total: Double? { OBNumber.parse(totalText) }

    private var canSave: Bool {
        (gallons ?? 0) > 0 && (price ?? 0) > 0 && (total ?? 0) > 0 && !isSaving
    }

    /// What the numbers imply, so a fat-fingered total is visible before it is
    /// saved rather than after it has moved the MPG.
    private var impliedTotal: Double? {
        guard let gallons, let price, gallons > 0, price > 0 else { return nil }
        return gallons * price
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
            .navigationTitle("Editar carga")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { dismiss() }
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
        }
    }

    private var form: some View {
        Form {
            Section {
                DatePicker("Fecha", selection: $date, displayedComponents: .date)
                OBNumberRow(label: "Galones", placeholder: "0.0", text: $gallonsText)
                OBNumberRow(label: "Precio / galón", prefix: "$", placeholder: "0.000", text: $priceText)
                OBNumberRow(label: "Total", prefix: "$", placeholder: "0.00", text: $totalText)
            } footer: {
                if let impliedTotal, let total, abs(impliedTotal - total) > 0.5 {
                    Text("Galones × precio da \(impliedTotal, format: .currency(code: "USD").precision(.fractionLength(2))). Revisa cuál de los tres está mal.")
                        .foregroundStyle(OBColor.warn)
                }
            }
            .listRowBackground(OBColor.card)

            Section {
                OBNumberRow(label: "Odómetro", placeholder: "0", text: $odometerText)
                TextField("Lugar", text: $location)
                TextField("Estado (2 letras)", text: $jurisdiction)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .onChange(of: jurisdiction) { value in
                        let letters = value.uppercased().filter { $0.isLetter }
                        let clipped = String(letters.prefix(2))
                        if clipped != value { jurisdiction = clipped }
                    }
            } footer: {
                Text("El estado es lo que decide en qué jurisdicción cuentan estos galones para el IFTA.")
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
    }

    private static func text(_ value: Double, decimals: Int = 2) -> String {
        guard value != 0 else { return "" }
        if value == value.rounded() { return String(Int(value)) }
        var text = String(format: "%.\(decimals)f", value)
        while text.contains(".") && (text.hasSuffix("0") || text.hasSuffix(".")) { text.removeLast() }
        return text
    }

    private func load() async {
        do {
            let record = try await repository.fetchFuelDetail(id: fuelId)
            date = record.date
            gallonsText = Self.text(record.gallons, decimals: 3)
            priceText = Self.text(record.pricePerGallon, decimals: 3)
            totalText = Self.text(record.totalCost)
            odometerText = record.odometer.map { String($0) } ?? ""
            location = record.location
            jurisdiction = record.jurisdiction
        } catch {
            loadFailure = (error as? LocalizedError)?.errorDescription ?? "No se pudo abrir esta carga."
        }
        isLoading = false
    }

    private func save() {
        guard let gallons, let price, let total, canSave else { return }
        isSaving = true
        failure = nil
        Task {
            do {
                let odometer = OBNumber.parse(odometerText).map { Int($0) }
                try await repository.updateFuelStop(
                    id: fuelId,
                    NewFuelStop(
                        date: date,
                        gallons: gallons,
                        pricePerGallon: price,
                        totalCost: total,
                        odometer: odometer,
                        location: location.trimmingCharacters(in: .whitespaces),
                        jurisdiction: jurisdiction
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
