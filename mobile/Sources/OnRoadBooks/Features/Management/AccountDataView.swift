import SwiftUI
import StoreKit

struct AccountDataView: View {
    let repository: LedgerRepository
    let queue: WriteQueue?
    var onSignOut: (() -> Void)?
    @State private var account: AccountSummary?
    @State private var intent = "reset"
    @State private var confirmation = ""
    @State private var confirming = false
    @State private var busy = false
    @State private var failure: String?
    @State private var success = false
    @State private var showManageSubscription = false

    private var expected: String { intent == "reset" ? "RESET" : account?.email ?? "" }
    var body: some View {
        Form {
            if account?.role == "Owner" {
                Section("Operación") {
                    Picker("Acción", selection: $intent) {
                        Text("Restablecer los libros").tag("reset")
                        Text("Eliminar mi cuenta").tag("delete")
                    }.onChange(of: intent) { _ in confirmation = ""; success = false }
                    Text(intent == "reset"
                         ? "Elimina los registros y documentos del negocio. Conserva la cuenta y la suscripción. No se puede deshacer."
                         : "Elimina tu cuenta y, si eres el último propietario, los registros y documentos del negocio. No se puede deshacer.")
                        .foregroundStyle(OBColor.neg)
                    Text("Los cambios pendientes del teléfono se descartarán al completar la operación.").font(.caption).foregroundStyle(.secondary)
                    if intent == "delete", account?.billingProvider == "apple" {
                        Text("Eliminar la cuenta no cancela los cobros de Apple. Cancela la renovación en Apple antes de eliminarla.").foregroundStyle(OBColor.warn)
                        Button("Gestionar suscripción de Apple") { showManageSubscription = true }
                    }
                }
                Section("Escribe \(expected) para confirmar") {
                    TextField(expected, text: $confirmation)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button(intent == "reset" ? "Restablecer los libros" : "Eliminar mi cuenta", role: .destructive) { confirming = true }
                        .disabled(expected.isEmpty || confirmation != expected || busy)
                }
            } else if account != nil {
                Text("Solo el propietario puede restablecer o eliminar la cuenta.")
            } else if failure == nil { ProgressView("Cargando cuenta…") }
            if busy { ProgressView("Procesando…") }
            if success { Text("Los libros se restablecieron.").foregroundStyle(OBColor.pos) }
            if let failure { Text(failure).foregroundStyle(OBColor.neg) }
        }
        .disabled(busy)
        .navigationTitle("Datos y cuenta")
        .navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden)
        .background(OBColor.background)
        .manageSubscriptionsSheet(isPresented: $showManageSubscription)
        .task {
            do { account = try await repository.fetchAccount() } catch { failure = error.localizedDescription }
        }
        .confirmationDialog("¿Confirmas esta operación irreversible?", isPresented: $confirming, titleVisibility: .visible) {
            Button(intent == "reset" ? "Restablecer" : "Eliminar cuenta", role: .destructive) { Task { await perform() } }
        }
    }
    @MainActor private func perform() async {
        // Hold pending writes before the request. Even an ambiguous network
        // failure must not silently replay old records into reset books.
        if let queue, !queue.holdForAccountChange() {
            failure = "Hay un envío en curso. Espera a que termine e inténtalo de nuevo."
            return
        }
        busy = true
        defer { busy = false }
        do {
            try await repository.changeAccountData(intent: intent, confirmation: confirmation)
            queue?.discardAllAfterAccountChange()
            confirmation = ""; failure = nil; success = true
            NotificationCenter.default.post(name: .obLedgerChanged, object: nil)
            if intent == "delete" { onSignOut?() }
        } catch { failure = error.localizedDescription }
    }
}
