import Foundation
import StoreKit

struct ApplePurchaseResult: Decodable { let id: String; let status: String; let plan: String }

@MainActor
final class ApplePurchaseStore: ObservableObject {
    nonisolated static let productIDs = ["com.mystodev.onroadbooks.starter.monthly", "com.mystodev.onroadbooks.pro.monthly"]
    @Published private(set) var products: [Product] = []
    @Published private(set) var busy = false
    @Published var message: String?
    @Published private(set) var revision = 0
    private var deliveries: [UInt64: Task<ApplePurchaseResult, Error>] = [:]

    func loadProducts() async {
        do {
            products = try await Product.products(for: Self.productIDs).sorted { $0.price < $1.price }
            if products.count != Self.productIDs.count { message = "Apple no devolvió todos los planes. Comprueba tu conexión y reintenta." }
        } catch { message = "No se pudieron cargar los precios de Apple. Reintenta cuando tengas conexión." }
    }

    private func deliver(_ result: VerificationResult<Transaction>, repository: LedgerRepository, expectedToken: UUID) async throws -> ApplePurchaseResult {
        guard case .verified(let transaction) = result else { throw APIError.refused("Apple no pudo verificar la compra.") }
        guard Self.productIDs.contains(transaction.productID), transaction.appAccountToken == expectedToken else {
            throw APIError.refused("Esta compra pertenece a otra cuenta de OnRoad Books. Inicia sesión con la cuenta con la que compraste.")
        }
        if let pending = deliveries[transaction.id] { return try await pending.value }
        try Task.checkCancellation()
        // Purchase and Transaction.updates can deliver the same payment concurrently.
        // Keep one delivery bound to the original account until the server acknowledges it.
        let pending = Task { @MainActor in
            let response = try await repository.syncApplePurchase(result.jwsRepresentation)
            // A network/server failure leaves the transaction unfinished for the next retry.
            await transaction.finish()
            revision += 1
            NotificationCenter.default.post(name: .obLedgerChanged, object: nil)
            return response
        }
        deliveries[transaction.id] = pending
        defer { deliveries[transaction.id] = nil }
        return try await pending.value
    }

    func purchase(_ product: Product, repository: LedgerRepository) async {
        guard !busy else { return }
        busy = true; message = nil
        defer { busy = false }
        do {
            let account = try await repository.fetchAccount()
            guard account.canPurchase == true, let raw = account.appAccountToken, let token = UUID(uuidString: raw) else {
                throw APIError.refused("Esta cuenta no puede iniciar otra suscripción. Revisa tu plan y la cuenta del propietario.")
            }
            for await entitlement in Transaction.currentEntitlements {
                if case .verified(let tx) = entitlement, Self.productIDs.contains(tx.productID), tx.appAccountToken != token {
                    throw APIError.refused("El Apple ID ya tiene una suscripción vinculada a otra cuenta de OnRoad Books. Entra en esa cuenta para restaurarla.")
                }
            }
            switch try await product.purchase(options: [.appAccountToken(token)]) {
            case .success(let verification):
                let result = try await deliver(verification, repository: repository, expectedToken: token)
                message = result.status == "ACTIVE" ? "Suscripción activada. Tu plan ya está actualizado." : "Compra sincronizada. Revisa el estado de la suscripción."
            case .pending: message = "La compra está pendiente de aprobación de Apple. Se activará cuando se confirme."
            case .userCancelled: message = "Compra cancelada. Tu plan no ha cambiado."
            @unknown default: message = "La compra sigue pendiente. Puedes restaurarla más tarde."
            }
        } catch { message = error.localizedDescription }
    }

    func restore(repository: LedgerRepository) async {
        guard !busy else { return }
        busy = true; message = nil
        defer { busy = false }
        do {
            let account = try await repository.fetchAccount()
            guard account.canManageBilling == true, let raw = account.appAccountToken, let token = UUID(uuidString: raw) else {
                throw APIError.refused("Inicia sesión como propietario para restaurar las compras.")
            }
            try await AppStore.sync()
            var restored = false
            for await entitlement in Transaction.currentEntitlements {
                guard case .verified(let tx) = entitlement, Self.productIDs.contains(tx.productID) else { continue }
                let result = try await deliver(entitlement, repository: repository, expectedToken: token)
                restored = restored || result.status == "ACTIVE"
            }
            message = restored ? "Compras restauradas. Tu plan ya está actualizado." : "No se encontraron suscripciones activas para este Apple ID."
        } catch { message = error.localizedDescription }
    }

    /// Lives at the authenticated app root, including when AccountView is closed.
    /// The root cancels this task on logout/account switch; no transaction is finished for another user.
    func listen(repository: LedgerRepository) async {
        // Start listening before any network request, so pending approvals cannot fall in a gap.
        let updates = Task { @MainActor in
            for await result in Transaction.updates {
                if Task.isCancelled { return }
                await synchronize(result, repository: repository)
            }
        }
        await withTaskCancellationHandler {
            await reconcile(repository: repository)
            await updates.value
        } onCancel: { updates.cancel() }
    }

    func reconcile(repository: LedgerRepository) async {
        for await result in Transaction.unfinished {
            if Task.isCancelled { return }
            await synchronize(result, repository: repository)
        }
        for await result in Transaction.currentEntitlements {
            if Task.isCancelled { return }
            await synchronize(result, repository: repository)
        }
    }

    private func synchronize(_ result: VerificationResult<Transaction>, repository: LedgerRepository) async {
        guard case .verified(let tx) = result, Self.productIDs.contains(tx.productID) else { return }
        do {
            let account = try await repository.fetchAccount()
            guard account.canManageBilling == true, let raw = account.appAccountToken, let token = UUID(uuidString: raw), tx.appAccountToken == token else { return }
            try Task.checkCancellation()
            _ = try await deliver(result, repository: repository, expectedToken: token)
        } catch is CancellationError { return }
        catch { message = "Hay una compra pendiente de sincronizar. Usa Restaurar compras cuando tengas conexión." }
    }
}
