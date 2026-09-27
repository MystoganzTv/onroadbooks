import SwiftUI

struct AccountSummary: Decodable {
    struct Plan: Decodable, Identifiable {
        let id: String
        let name: String
        let priceMonthly: Double
        let features: [String]
    }
    struct Truck: Decodable { let id: String; let name: String }
    let trucks: [Truck]
    let businessName: String
    let email: String
    let role: String
    let planName: String
    let status: String
    let currentPeriodEnd: String?
    let canWrite: Bool
    let trialEndsOn: String?
    let plans: [Plan]
}
struct AccountView: View {
    let repository: LedgerRepository
    @State private var account: AccountSummary?
    @State private var failure: String?
    var body: some View {
        List {
            if let account {
                Section("Cuenta") {
                    LabeledContent("Negocio", value: account.businessName)
                    LabeledContent("Email", value: account.email)
                    LabeledContent("Rol", value: account.role)
                }
                Section("Suscripción") {
                    LabeledContent("Plan", value: account.planName)
                    LabeledContent("Estado", value: account.status)
                    if let date = account.trialEndsOn ?? account.currentPeriodEnd {
                        LabeledContent(account.trialEndsOn != nil ? "Fin de prueba" : "Fin del período", value: date)
                    }
                    if !account.canWrite {
                        Text("Puedes consultar y exportar tus datos. La suscripción necesita atención para guardar cambios.")
                            .foregroundStyle(OBColor.warn)
                    }
                    Text("La compra y los cambios de método de pago todavía se gestionan en onroadbooks.com.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                ForEach(account.plans) { plan in
                    Section(plan.name) {
                        Text("\(plan.priceMonthly, format: .currency(code: "USD"))/mes").font(.headline)
                        ForEach(plan.features, id: \.self) { Text($0) }
                    }
                }
            } else if failure == nil { ProgressView("Cargando cuenta…") }
            if let failure {
                Text(failure).foregroundStyle(OBColor.neg)
                Button("Reintentar") { Task { await reload() } }
            }
        }
        .navigationTitle("Cuenta y plan")
        .navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden)
        .background(OBColor.background)
        .task { await reload() }
        .refreshable { await reload() }
    }
    @MainActor private func reload() async {
        do { account = try await repository.fetchAccount(); failure = nil }
        catch { failure = error.localizedDescription }
    }
}
