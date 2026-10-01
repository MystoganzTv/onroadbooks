import SwiftUI
import UniformTypeIdentifiers
import QuickLook

struct DocumentLibrary: Decodable {
    struct Document: Decodable, Identifiable { let id: String; let fileName: String; let type: String; let canDelete: Bool }
    struct Target: Decodable, Identifiable { let id: String; let owner: String; let label: String }
    struct Kind: Decodable, Identifiable { let id: String; let label: String }
    let documents: [Document]
    let targets: [Target]
    let types: [Kind]
    let typesFor: [String: [String]]
    let maxBytes: Int
}
struct DocumentsView: View {
    let repository: LedgerRepository
    @State private var library: DocumentLibrary?
    @State private var failure: String?
    @State private var preview: URL?
    @State private var removing: DocumentLibrary.Document?
    @State private var adding = false
    @State private var busy = false
    @State private var search = ""
    var body: some View {
        List {
            if let library {
                ForEach(library.documents.filter { search.isEmpty || $0.fileName.localizedCaseInsensitiveContains(search) || $0.type.localizedCaseInsensitiveContains(search) }) { document in
                    Button { Task { await open(document) } } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(document.fileName)
                            Text(document.type).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .swipeActions {
                        if document.canDelete {
                            Button("Eliminar", role: .destructive) { removing = document }
                        }
                    }
                }
                if library.documents.isEmpty { Text("Todavía no hay documentos.").foregroundStyle(.secondary) }
            } else if failure == nil { ProgressView("Cargando documentos…") }
            if busy { ProgressView() }
            if let failure {
                Text(failure).foregroundStyle(OBColor.neg)
                Button("Reintentar") { Task { await reload() } }
            }
        }
        .navigationTitle("Documentos")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, prompt: "Buscar documentos")
        .scrollContentBackground(.hidden)
        .background(OBColor.background)
        .toolbar {
            if library?.targets.isEmpty == false {
                Button { adding = true } label: { Label("Adjuntar", systemImage: "plus") }
            }
        }
        .disabled(busy)
        .quickLookPreview($preview)
        .task { await reload() }
        .obRefreshable { await reload() }
        .sheet(isPresented: $adding) {
            if let library {
                AddDocumentView(repository: repository, library: library) { Task { await reload() } }
            }
        }
        .confirmationDialog("¿Eliminar el documento?", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }), titleVisibility: .visible) {
            Button("Eliminar", role: .destructive) {
                guard let document = removing else { return }
                removing = nil
                Task {
                    busy = true
                    defer { busy = false }
                    do { try await repository.deleteStoredDocument(document.id); await reload() }
                    catch { failure = error.localizedDescription }
                }
            }
        } message: { Text(removing?.fileName ?? "") }
    }
    @MainActor private func reload() async {
        do { library = try await repository.fetchDocuments(); failure = nil }
        catch { failure = error.localizedDescription }
    }
    @MainActor private func open(_ document: DocumentLibrary.Document) async {
        busy = true
        defer { busy = false }
        do { preview = try await repository.downloadDocument(document.id) }
        catch { failure = error.localizedDescription }
    }
}
private struct AddDocumentView: View {
    let repository: LedgerRepository
    let library: DocumentLibrary
    let onSaved: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var owner = "LOAD"
    @State private var targetId = ""
    @State private var kind = ""
    @State private var choosing = false
    @State private var selectedURL: URL?
    @State private var failure: String?
    @State private var saving = false
    var body: some View {
        NavigationStack {
            Form {
                Picker("Pertenece a", selection: $owner) {
                    Text("Carga").tag("LOAD"); Text("Gasto").tag("EXPENSE")
                    Text("Camión").tag("TRUCK"); Text("Mantenimiento").tag("MAINTENANCE")
                }
                .onChange(of: owner) { _ in targetId = ""; kind = "" }
                Picker("Registro", selection: $targetId) {
                    Text("Seleccionar").tag("")
                    ForEach(library.targets.filter { $0.owner == owner }) { target in Text(target.label).tag(target.id) }
                }
                Picker("Tipo de documento", selection: $kind) {
                    Text("Seleccionar").tag("")
                    ForEach(library.types.filter { library.typesFor[owner, default: []].contains($0.id) }) { type in Text(type.label).tag(type.id) }
                }
                Button(selectedURL?.lastPathComponent ?? "Elegir PDF o imagen") { choosing = true }
                Text("Máximo \(library.maxBytes / 1024 / 1024) MB por archivo.").font(.caption).foregroundStyle(.secondary)
                if let failure { Text(failure).foregroundStyle(OBColor.neg) }
                Button { Task { await save() } } label: {
                    if saving { ProgressView() } else { Text("Adjuntar documento") }
                }
                .disabled(saving || targetId.isEmpty || kind.isEmpty || selectedURL == nil)
            }
            .disabled(saving)
            .navigationTitle("Adjuntar documento")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancelar") { dismiss() }.disabled(saving) } }
            .interactiveDismissDisabled(saving)
            .fileImporter(isPresented: $choosing, allowedContentTypes: [.pdf, .jpeg, .png, .heic, .gif, .webP]) { result in
                do { selectedURL = try result.get() } catch { failure = error.localizedDescription }
            }
        }
    }
    @MainActor private func save() async {
        guard let url = selectedURL else { return }
        saving = true
        defer { saving = false }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard size > 0 && size <= library.maxBytes else { throw APIError.refused("El archivo está vacío o supera el tamaño permitido.") }
            let data = try Data(contentsOf: url)
            let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
            try await repository.uploadDocument(owner: owner, entityId: targetId, type: kind, name: url.lastPathComponent, contentType: mime, data: data)
            onSaved(); dismiss()
        } catch { failure = error.localizedDescription }
    }
}
