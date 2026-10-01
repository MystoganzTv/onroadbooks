import SwiftUI
import StoreKit

struct AccountSummary: Decodable {
    struct Plan: Decodable, Identifiable {
        let id: String
        let name: String
        let priceMonthly: Double
        let features: [String]
        let productId: String?
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
    let planId: String?
    let billingProvider: String?
    let canManageBilling: Bool?
    let canPurchase: Bool?
    let appAccountToken: String?
}
struct AccountView: View {
    let repository: LedgerRepository
    @EnvironmentObject private var purchases: ApplePurchaseStore
    @State private var showManage = false
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
                    if account.billingProvider == "web" {
                        Text("Tu suscripción se gestiona en la web. No necesitas comprar otro plan para usar la app.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    if account.canManageBilling != true { Text("Solo el propietario puede gestionar el plan.").font(.footnote) }
                    if account.billingProvider == "apple", account.canManageBilling == true {
                        Button("Gestionar suscripción de Apple") { showManage = true }
                    }
                }
                ForEach(account.plans.filter { $0.id != "FLEET" }) { plan in
                    Section(plan.name) {
                        if let product = purchases.products.first(where: { $0.id == plan.productId }) {
                            Text("\(product.displayPrice) / mes").font(.headline)
                            if account.billingProvider == "apple", account.planId == plan.id, account.canWrite {
                                Label("Plan actual", systemImage: "checkmark.circle.fill").foregroundStyle(OBColor.pos)
                            } else if account.canPurchase == true {
                                Button("Suscribirme a \(plan.name)") { Task { await purchases.purchase(product, repository: repository); await reload() } }
                                    .disabled(purchases.busy)
                            }
                        } else { Text("Precio disponible al conectar con App Store").font(.footnote).foregroundStyle(.secondary) }
                        ForEach(plan.features, id: \.self) { Text($0) }
                    }
                }
                if account.canManageBilling == true {
                    Section {
                        Button("Restaurar compras") { Task { await purchases.restore(repository: repository); await reload() } }.disabled(purchases.busy)
                        Button("Recargar precios") { Task { await purchases.loadProducts() } }.disabled(purchases.busy)
                        if purchases.busy { ProgressView("Confirmando con Apple…") }
                        if let message = purchases.message { Text(message).font(.callout).accessibilityIdentifier("purchaseMessage") }
                    }
                    Section("Condiciones") {
                        Text("Suscripción mensual con renovación automática. Apple cobra a tu cuenta al confirmar. Puedes cambiar o cancelar la renovación en los ajustes de suscripciones de Apple. La cancelación conserva el acceso hasta el final del período pagado.").font(.footnote)
                        Link("Términos de uso (EULA)", destination: URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!)
                        Link("Términos de OnRoad Books", destination: URL(string: "https://onroadbooks.com/terms")!)
                        Link("Política de privacidad", destination: URL(string: "https://onroadbooks.com/privacy")!)
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
        .task { await reload(); await purchases.loadProducts() }
        .onChange(of: purchases.revision) { _ in Task { await reload() } }
        .manageSubscriptionsSheet(isPresented: $showManage)
        .obRefreshable { await reload() }
    }
    @MainActor private func reload() async {
        do { account = try await repository.fetchAccount(); failure = nil }
        catch { failure = error.localizedDescription }
    }
}
