import SwiftUI

/// The people who drive the trucks — an operational record, and nothing more.
///
/// Adding a driver here never creates an app sign-in. That is Access & Roles,
/// a separate screen with a separate invitation, and keeping the two apart is
/// the whole point: a driver's name in the books should not be a decision
/// about who can see the money.
struct DriversView: View {
    let repository: LedgerRepository

    @State private var drivers: [DriverRecord] = []
    @State private var isLoading = true
    @State private var refusal: String?
    @State private var isAdding = false
    @State private var failure: String?

    var body: some View {
        Group {
            if isLoading {
                ProgressView().tint(OBColor.primary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let refusal {
                VStack(spacing: OBSpacing.sm) {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 30))
                        .foregroundStyle(OBColor.mutedForeground)
                    Text(refusal)
                        .font(.subheadline)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(OBColor.mutedForeground)
                        .padding(.horizontal, OBSpacing.lg)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if drivers.isEmpty {
                VStack(spacing: OBSpacing.sm) {
                    Text("Ningún chofer todavía")
                        .font(.headline)
                        .foregroundStyle(OBColor.foreground)
                    Text("Un chofer aquí es solo un registro de operación: no crea acceso a la app.")
                        .font(.subheadline)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(OBColor.mutedForeground)
                        .padding(.horizontal, OBSpacing.lg)
                    Button("Agregar chofer") { isAdding = true }
                        .buttonStyle(.borderedProminent)
                        .tint(OBColor.primary)
                        .frame(minHeight: 44)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    ForEach(drivers) { driver in
                        DriverRow(driver: driver)
                            .listRowBackground(OBColor.card)
                            .listRowSeparatorTint(OBColor.border)
                            .swipeActions(edge: .trailing) {
                                Button {
                                    setActive(driver, active: !driver.active)
                                } label: {
                                    Label(driver.active ? "Retirar" : "Reactivar",
                                          systemImage: driver.active ? "person.slash" : "person.badge.plus")
                                }
                                .tint(driver.active ? OBColor.warn : OBColor.primary)
                            }
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .background(OBColor.background)
        .navigationTitle("Choferes")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if refusal == nil {
                ToolbarItem(placement: .primaryAction) {
                    Button { isAdding = true } label: { Image(systemName: "plus") }
                }
            }
        }
        .task { await reload() }
        .refreshable { await reload() }
        .sheet(isPresented: $isAdding) {
            AddDriverView(repository: repository, onSaved: { Task { await reload() } })
        }
        .alert(
            "No se pudo",
            isPresented: Binding(get: { failure != nil }, set: { if !$0 { failure = nil } })
        ) {
            Button("Entendido", role: .cancel) { failure = nil }
        } message: {
            Text(failure ?? "")
        }
    }

    private func reload() async {
        do {
            drivers = try await repository.fetchDrivers()
            refusal = nil
        } catch APIError.refused(let message) {
            refusal = message
        } catch {
            failure = (error as? LocalizedError)?.errorDescription ?? "No se pudieron cargar los choferes."
        }
        isLoading = false
    }

    private func setActive(_ driver: DriverRecord, active: Bool) {
        Task {
            do {
                try await repository.setDriverActive(id: driver.id, active: active)
                await reload()
            } catch {
                failure = (error as? LocalizedError)?.errorDescription ?? "No se pudo cambiar el chofer."
            }
        }
    }
}

private struct DriverRow: View {
    let driver: DriverRecord

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(driver.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(OBColor.foreground)
                Spacer()
                StatusPill(text: driver.active ? "ACTIVO" : "RETIRADO", isActive: driver.active)
            }
            Text(driver.payDescription)
                .font(.caption)
                .foregroundStyle(OBColor.mutedForeground)
        }
        .padding(.vertical, 6)
    }
}

/// The four pay types the settlement maths knows how to allocate. Anything
/// else would be a number the statement could not explain.
private struct AddDriverView: View {
    let repository: LedgerRepository
    let onSaved: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var payType = "PER_LOADED_MILE"
    @State private var rateText = ""
    @State private var reference = ""
    @State private var isSaving = false
    @State private var failure: String?

    private let payTypes: [(id: String, label: String)] = [
        ("PERCENT_GROSS", "% del bruto"),
        ("PER_LOADED_MILE", "Por milla cargada"),
        ("PER_TOTAL_MILE", "Por milla total"),
        ("FLAT_PER_LOAD", "Fijo por carga"),
    ]

    private var rate: Double? { OBNumber.parse(rateText) }
    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && (rate ?? 0) > 0 && !isSaving
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Nombre", text: $name)
                    Picker("Forma de pago", selection: $payType) {
                        ForEach(payTypes, id: \.id) { option in
                            Text(option.label).tag(option.id)
                        }
                    }
                    OBNumberRow(
                        label: payType == "PERCENT_GROSS" ? "Porcentaje" : "Tarifa",
                        prefix: payType == "PERCENT_GROSS" ? nil : "$",
                        suffix: payType == "PERCENT_GROSS" ? "%" : nil,
                        placeholder: payType == "PERCENT_GROSS" ? "27" : "0.62",
                        text: $rateText
                    )
                    TextField("Referencia interna (opcional)", text: $reference)
                } footer: {
                    Text("Agregar un chofer no crea acceso a la app. Para eso está Accesos y roles.")
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
            .navigationTitle("Nuevo chofer")
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
        guard let rate, canSave else { return }
        isSaving = true
        failure = nil
        Task {
            do {
                let trimmed = reference.trimmingCharacters(in: .whitespaces)
                try await repository.createDriver(
                    NewDriver(
                        name: name.trimmingCharacters(in: .whitespaces),
                        payType: payType,
                        payRate: rate,
                        reference: trimmed.isEmpty ? nil : trimmed,
                        defaultTruckId: nil
                    )
                )
                onSaved()
                dismiss()
            } catch {
                failure = (error as? LocalizedError)?.errorDescription ?? "No se pudo guardar el chofer."
                isSaving = false
            }
        }
    }
}
