import SwiftUI
import UniformTypeIdentifiers

struct RateConImport: View {
    let repository: LedgerRepository
    let onRead: ([String: String]) -> Void
    @State private var choosing = false
    @State private var selected: URL?
    @State private var reading = false
    @State private var failure: String?
    @State private var imported = false
    var body: some View {
        Section("Confirmación de tarifa") {
            Text("Importa un PDF o una foto para completar el formulario. Revisa los datos antes de guardar la carga.").font(.footnote).foregroundStyle(.secondary)
            Button(selected?.lastPathComponent ?? "Elegir documento") { choosing = true }.disabled(reading)
            if let selected {
                Button { Task { await scan(selected) } } label: {
                    if reading { ProgressView("Leyendo…") } else { Text("Leer y completar campos") }
                }.disabled(reading)
            }
            if imported { Label("Datos importados. Revisa todos los campos.", systemImage: "checkmark.circle").foregroundStyle(OBColor.pos) }
            if let failure { Text(failure).foregroundStyle(OBColor.neg) }
        }
        .fileImporter(isPresented: $choosing, allowedContentTypes: [.pdf, .jpeg, .png, .webP]) { result in
            do { selected = try result.get(); imported = false; failure = nil } catch { failure = error.localizedDescription }
        }
    }
    @MainActor private func scan(_ url: URL) async {
        reading = true
        defer { reading = false }
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        do {
            let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard size > 0 && size <= 4 * 1024 * 1024 else { throw APIError.refused("El archivo debe pesar menos de 4 MB.") }
            let data = try Data(contentsOf: url)
            let fields = try await repository.scanRateCon(data: data, contentType: UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/pdf")
            onRead(fields); imported = true; failure = nil
        } catch { failure = error.localizedDescription }
    }
}
