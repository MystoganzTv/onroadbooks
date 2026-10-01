import SwiftUI

struct ManagementView: View {
    let repository: LedgerRepository
    let resource: String
    let title: String
    @State private var collection: ManagementCollection?
    @State private var failure: String?
    @State private var search = ""
    @State private var adding = false
    @State private var loading = false
    @State private var quarter = "\(Calendar.current.component(.year, from: Date()))-Q\((Calendar.current.component(.month, from: Date()) - 1) / 3 + 1)"

    private var records: [ManagementRecord] {
        (collection?.records ?? []).filter { search.isEmpty || "\($0.title) \($0.subtitle)".localizedCaseInsensitiveContains(search) }
    }
    private var quarters: [String] {
        let year = Calendar.current.component(.year, from: Date())
        return (year-5...year+1).reversed().flatMap { y in (1...4).reversed().map { "\(y)-Q\($0)" } }
    }
    var body: some View {
        List {
            if resource == "ifta-rates" {
                Picker("Trimestre", selection: $quarter) {
                    ForEach(quarters, id: \.self) { Text($0).tag($0) }
                }
            }
            if let collection {
                relatedSections
                Section {
                    Text(collection.description).font(.subheadline).foregroundStyle(.secondary)
                    if let refusal = collection.refusal {
                        Label(refusal, systemImage: "lock").font(.footnote)
                    }
                }
                if records.isEmpty {
                    Text(search.isEmpty ? "Todavía no hay registros." : "No hay resultados para esta búsqueda.")
                        .foregroundStyle(.secondary)
                }
                ForEach(records) { record in
                    NavigationLink {
                        ManagementEditor(repository: repository, resource: resource, collection: collection, record: record) {
                            Task { await reload() }
                        }
                    } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(record.title).font(.headline)
                            if !record.subtitle.isEmpty { Text(record.subtitle).font(.caption).foregroundStyle(.secondary) }
                        }
                        .padding(.vertical, 5)
                    }
                }
            }
            if loading && collection == nil { ProgressView("Cargando…") }
            if let failure {
                Section {
                    Text(failure).foregroundStyle(OBColor.neg)
                    Button("Reintentar") { Task { await reload() } }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(OBColor.background)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, prompt: "Buscar")
        .toolbar {
            if collection?.canCreate == true {
                ToolbarItem(placement: .primaryAction) {
                    Button { adding = true } label: { Label("Agregar", systemImage: "plus") }
                }
            }
        }
        .task(id: quarter) { await reload() }
        .obRefreshable { await reload() }
        .sheet(isPresented: $adding) {
            if let collection {
                NavigationStack {
                    ManagementEditor(repository: repository, resource: resource, collection: collection, record: nil) {
                        Task { await reload() }
                    }
                }
            }
        }
    }
    @ViewBuilder private var relatedSections: some View {
        switch resource {
        case "brokers":
            Section("Administrar") {
                NavigationLink("Contactos") { ManagementView(repository: repository, resource: "broker-contacts", title: "Contactos") }
                NavigationLink("Unificar nombres y perfiles") { ManagementView(repository: repository, resource: "broker-merge", title: "Unificar brokers") }
            }
        case "trucks":
            Section("Administrar") {
                NavigationLink("Retirar o reactivar camiones") { ManagementView(repository: repository, resource: "truck-status", title: "Estado de camiones") }
                NavigationLink("Perfil de costos y financiamiento") { ManagementView(repository: repository, resource: "truck-planning", title: "Perfil de costos") }
            }
        case "reserve-buckets":
            Section("Administrar") {
                NavigationLink("Movimientos manuales") { ManagementView(repository: repository, resource: "reserve-movements", title: "Movimientos") }
            }
        default: EmptyView()
        }
    }
    @MainActor private func reload() async {
        loading = true
        defer { loading = false }
        do {
            collection = try await repository.fetchManagement(resource, quarter: resource == "ifta-rates" ? quarter : nil)
            failure = nil
        } catch { failure = error.localizedDescription }
    }
}

struct ManagementEditor: View {
    let repository: LedgerRepository
    let resource: String
    let collection: ManagementCollection
    let record: ManagementRecord?
    let onSaved: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var values: [String: String]
    @State private var saving = false
    @State private var failure: String?
    @State private var confirmDelete = false
    @State private var invoiceFile: URL?
    @State private var confirmMerge = false

    init(repository: LedgerRepository, resource: String, collection: ManagementCollection, record: ManagementRecord?, onSaved: @escaping () -> Void) {
        self.repository = repository
        self.resource = resource
        self.collection = collection
        self.record = record
        self.onSaved = onSaved
        _values = State(initialValue: record?.values ?? collection.defaults)
    }
    private var sections: [String] {
        collection.fields.reduce(into: [String]()) { if !$0.contains($1.section) { $0.append($1.section) } }
    }
    private var editable: Bool { record == nil ? collection.canCreate : collection.canEdit }
    private var valid: Bool {
        collection.fields.allSatisfy { field in
            let value = values[field.key, default: ""].trimmingCharacters(in: .whitespacesAndNewlines)
            if field.required && value.isEmpty { return false }
            if field.kind == "number" && !value.isEmpty { return OBNumber.parse(value)?.isFinite == true }
            return true
        }
    }
    var body: some View {
        Form {
            if record == nil && collection.scanAvailable {
                RateConImport(repository: repository) { fields in
                    values.merge(fields) { _, imported in imported }
                }
            }
            if let record, !record.details.isEmpty {
                Section("Resumen") {
                    ForEach(Array(record.details.enumerated()), id: \.offset) { _, detail in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(detail.label).font(.caption).foregroundStyle(.secondary)
                            Text(detail.value).monospacedDigit()
                        }
                    }
                }
            }
            if let refusal = collection.refusal { Text(refusal).foregroundStyle(.secondary) }
            ForEach(sections, id: \.self) { section in
                Section(section) {
                    if resource == "ifta-mileage" {
                        DisclosureGroup(section, isExpanded: sectionBinding(section)) { fields(in: section) }
                    } else { fields(in: section) }
                }
                .disabled(!editable || saving)
            }
            if let failure { Section { Text(failure).foregroundStyle(OBColor.neg) } }
            if resource == "invoices", let record {
                Section("PDF") {
                    if let invoiceFile { ShareLink("Compartir PDF", item: invoiceFile) }
                    else { Button("Preparar PDF") { Task {
                        do { invoiceFile = try await repository.downloadInvoice(loadId: record.id) }
                        catch { failure = error.localizedDescription }
                    } } }
                    Text("Guarda primero la factura para generar su PDF.").font(.caption).foregroundStyle(.secondary)
                }
            }
            if editable {
                Section {
                    Button { if resource == "broker-merge" { confirmMerge = true } else { Task { await save() } } } label: {
                        if saving { ProgressView() } else { Text("Guardar cambios") }
                    }
                    .disabled(saving || !valid)

                }
            }
            if record != nil && collection.canDelete {
                Section { Button("Eliminar registro", role: .destructive) { confirmDelete = true }.disabled(saving) }
            }
        }
        .scrollContentBackground(.hidden)
        .background(OBColor.background)
        .navigationTitle(record?.title ?? "Agregar")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if record == nil {
                ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() }.disabled(saving) }
            }
        }
        .interactiveDismissDisabled(saving)
        .confirmationDialog("¿Unificar este broker con el destino elegido?", isPresented: $confirmMerge, titleVisibility: .visible) {
            Button("Unificar brokers", role: .destructive) { Task { await save() } }
        } message: { Text("Se moverán sus cargas y contactos al broker de destino. Revisa el destino antes de confirmar.") }
        .confirmationDialog("¿Eliminar este registro?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Eliminar", role: .destructive) { Task { await remove() } }
        } message: {
            Text(resource == "maintenance" ? "También se eliminará el gasto vinculado a este servicio." : "La eliminación se aplicará también en la web. Esta acción no se puede deshacer.")
        }
    }
    @State private var expanded: [String: Bool] = [:]
    private func sectionBinding(_ section: String) -> Binding<Bool> {
        Binding(get: {
            expanded[section] ?? collection.fields.filter { $0.section == section }.contains { !(record?.values[$0.key] ?? "").isEmpty }
        }, set: { expanded[section] = $0 })
    }
    @ViewBuilder private func fields(in section: String) -> some View {
        ForEach(collection.fields.filter { $0.section == section }) { field in
            control(field)
        }
    }
    private func text(_ key: String) -> Binding<String> {
        Binding(get: { values[key, default: ""] }, set: { values[key] = $0 })
    }
    @ViewBuilder private func control(_ field: ManagementField) -> some View {
        switch field.kind {
        case "toggle":
            Toggle(field.label, isOn: Binding(get: { values[field.key] == "true" }, set: { values[field.key] = String($0) }))
        case "choice":
            Picker(field.label, selection: text(field.key)) {
                Text(field.required ? "Seleccionar" : "Sin especificar").tag("")
                ForEach(field.options ?? []) { option in
                    Text(option.value == "true" ? "Sí" : option.value == "false" ? "No" : option.label).tag(option.value)
                }
            }
        case "date":
            if !field.required {
                Toggle(field.label, isOn: Binding(get: { !values[field.key, default: ""].isEmpty }, set: { values[field.key] = $0 ? OBDate.todayISO() : "" }))
            }
            if field.required || !values[field.key, default: ""].isEmpty {
                DatePicker(field.label, selection: Binding(get: { ISODate.parse(values[field.key, default: ""]) }, set: { values[field.key] = ISODate.day($0) }), displayedComponents: .date)
            }
        default:
            VStack(alignment: .leading, spacing: 5) {
                Text(field.label + (field.required ? " *" : "")).font(.caption).foregroundStyle(.secondary)
                TextField(field.required ? "Requerido" : "Opcional", text: text(field.key), axis: field.kind == "multiline" ? .vertical : .horizontal)
                    .accessibilityLabel(field.label)
                    .keyboardType(field.kind == "number" ? .decimalPad : field.key == "email" ? .emailAddress : .default)
                    .textInputAutocapitalization(field.key == "email" ? .never : .sentences)
                    .autocorrectionDisabled(field.key == "email" || field.kind == "number")
                    .disabled(field.key == "quarter")
            }
        }
    }
    @MainActor private func save() async {
        saving = true
        defer { saving = false }
        do {
            var normalized = values
            for field in collection.fields where field.kind == "number" {
                if let number = OBNumber.parse(values[field.key, default: ""]) { normalized[field.key] = String(number) }
            }
            try await repository.saveManagement(resource, id: record?.id, values: normalized)
            NotificationCenter.default.post(name: .obLedgerChanged, object: nil)
            onSaved()
            dismiss()
        } catch { failure = error.localizedDescription }
    }
    @MainActor private func remove() async {
        guard let record else { return }
        saving = true
        defer { saving = false }
        do {
            try await repository.deleteManagement(resource, id: record.id)
            NotificationCenter.default.post(name: .obLedgerChanged, object: nil)
            onSaved()
            dismiss()
        } catch { failure = error.localizedDescription }
    }
}

struct FinancingManagementView: View {
    let repository: LedgerRepository
    var body: some View {
        List {
            NavigationLink("Préstamos y arrendamientos") {
                ManagementView(repository: repository, resource: "financing", title: "Financiamiento")
            }
            NavigationLink("Clasificar pagos pendientes") {
                ManagementView(repository: repository, resource: "debt-payments", title: "Clasificar pagos")
            }
        }
        .navigationTitle("Financiamiento")
        .scrollContentBackground(.hidden)
        .background(OBColor.background)
    }
}
