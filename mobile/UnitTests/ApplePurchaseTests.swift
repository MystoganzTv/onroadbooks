import XCTest
import StoreKit
import StoreKitTest
import SwiftUI
@testable import OnRoad_Books

/// StoreKit runs locally; URLProtocol replaces only this repository's HTTP session.
/// Nothing here contacts Apple, production, Stripe, or a real customer account.
final class PurchaseHTTPStub: URLProtocol {
    static let token = UUID(uuidString: "ebd729a8-2a6a-4354-a0d8-bcbfe9b042c2")!
    static var accountToken = token
    static var failDelivery = false
    static var deliveries = 0
    static var purchaseAllowed = true
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "storekit.example.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let account: [String: Any] = [
            "trucks": [], "businessName": "OnRoad Demo", "email": "review@example.test", "role": "Owner",
            "planName": "OnRoad Pro", "status": "TRIALING", "canWrite": true, "planId": "OWNER",
            "billingProvider": "none", "canManageBilling": true, "canPurchase": Self.purchaseAllowed,
            "appAccountToken": Self.accountToken.uuidString,
            "plans": [
                ["id": "SOLO", "name": "Solo Starter", "priceMonthly": 19, "features": ["One truck, unlimited loads", "Income, expenses, fuel and reports"], "productId": ApplePurchaseStore.productIDs[0]],
                ["id": "OWNER", "name": "OnRoad Pro", "priceMonthly": 39, "features": ["Everything in Solo Starter", "Load planning, reserves and goals"], "productId": ApplePurchaseStore.productIDs[1]]
            ]
        ]
        let isPurchase = request.url!.path.hasSuffix("apple-purchases")
        if isPurchase { Self.deliveries += 1 }
        let status = isPurchase && Self.failDelivery ? 503 : 200
        let body: [String: Any] = isPurchase ? (Self.failDelivery ? ["error": "Servidor temporalmente no disponible"] : ["id": "verified-by-test-fixture", "status": "ACTIVE", "plan": "SOLO"]) : account
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: try! JSONSerialization.data(withJSONObject: body))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@MainActor final class ApplePurchaseTests: XCTestCase {
    var storeSession: SKTestSession!
    var repository: APIRepository!
    override func setUpWithError() throws {
        storeSession = try SKTestSession(configurationFileNamed: "OnRoadBooks")
        storeSession.resetToDefaultState()
        storeSession.disableDialogs = true
        guard storeSession.disableDialogs else {
            throw APIError.refused("StoreKit local no pudo activarse. Usa iOS 18.2; el runtime 26.5 tiene el fallo de Apple FB22237318. Nunca continuar contra la tienda real.")
        }
        storeSession.clearTransactions()
        PurchaseHTTPStub.accountToken = PurchaseHTTPStub.token
        PurchaseHTTPStub.failDelivery = false
        PurchaseHTTPStub.deliveries = 0
        PurchaseHTTPStub.purchaseAllowed = true
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [PurchaseHTTPStub.self]
        repository = APIRepository(baseURL: URL(string: "https://storekit.example.test")!, tokenProvider: { "isolated-test" }, session: URLSession(configuration: config))
    }

    func testNativePurchaseAndRestore() async throws {
        let store = ApplePurchaseStore()
        await store.loadProducts()
        XCTAssertEqual(store.products.count, 2)
        let product = try XCTUnwrap(store.products.first)
        await store.purchase(product, repository: repository)
        XCTAssertEqual(store.message, "Suscripción activada. Tu plan ya está actualizado.")
        XCTAssertGreaterThan(PurchaseHTTPStub.deliveries, 0)
        var unfinished = 0
        for await _ in Transaction.unfinished { unfinished += 1 }
        XCTAssertEqual(unfinished, 0)
        await store.restore(repository: repository)
        XCTAssertEqual(store.message, "Compras restauradas. Tu plan ya está actualizado.")
    }

    func testServerFailureLeavesPurchaseUnfinishedForRetry() async throws {
        let store = ApplePurchaseStore()
        await store.loadProducts()
        PurchaseHTTPStub.failDelivery = true
        await store.purchase(try XCTUnwrap(store.products.first), repository: repository)
        XCTAssertEqual(store.message, "Servidor temporalmente no disponible")
        var unfinished = 0
        for await _ in Transaction.unfinished { unfinished += 1 }
        XCTAssertEqual(unfinished, 1)
        PurchaseHTTPStub.failDelivery = false
        await store.reconcile(repository: repository)
        var remaining = 0
        for await _ in Transaction.unfinished { remaining += 1 }
        XCTAssertEqual(remaining, 0)
    }

    func testRestoreCannotMovePurchaseToAnotherAccount() async throws {
        let store = ApplePurchaseStore()
        await store.loadProducts()
        await store.purchase(try XCTUnwrap(store.products.first), repository: repository)
        PurchaseHTTPStub.accountToken = UUID()
        PurchaseHTTPStub.deliveries = 0
        await store.restore(repository: repository)
        XCTAssertTrue(store.message?.contains("otra cuenta") == true)
        XCTAssertEqual(PurchaseHTTPStub.deliveries, 0)
    }

    func testPendingApprovalDoesNotActivatePlan() async throws {
        storeSession.askToBuyEnabled = true
        let store = ApplePurchaseStore()
        await store.loadProducts()
        await store.purchase(try XCTUnwrap(store.products.first), repository: repository)
        XCTAssertTrue(store.message?.contains("pendiente") == true)
        XCTAssertEqual(PurchaseHTTPStub.deliveries, 0)
        let listener = Task { await store.listen(repository: repository) }
        defer { listener.cancel() }
        let pending = try XCTUnwrap(storeSession.allTransactions().first)
        try storeSession.approveAskToBuyTransaction(identifier: pending.identifier)
        for _ in 0..<30 where PurchaseHTTPStub.deliveries == 0 {
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTAssertGreaterThan(PurchaseHTTPStub.deliveries, 0, "Approval must sync without opening AccountView again")
    }

    func testExistingWebSubscriptionDoesNotStartPurchase() async throws {
        PurchaseHTTPStub.purchaseAllowed = false
        let store = ApplePurchaseStore()
        await store.loadProducts()
        await store.purchase(try XCTUnwrap(store.products.first), repository: repository)
        XCTAssertTrue(store.message?.contains("no puede iniciar") == true)
        XCTAssertEqual(storeSession.allTransactions().count, 0)
    }

    func testNativePurchaseScreenForReview() async throws {
        let store = ApplePurchaseStore()
        await store.loadProducts()
        XCTAssertEqual(store.products.count, 2)
        let window = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first(where: \.isKeyWindow))
        let previous = window.rootViewController
        defer { window.rootViewController = previous }
        window.rootViewController = UIHostingController(rootView: NavigationStack {
            AccountView(repository: repository).environmentObject(store)
        }.preferredColorScheme(.dark))
        window.makeKeyAndVisible()
        try await Task.sleep(nanoseconds: 2_000_000_000)
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in window.drawHierarchy(in: window.bounds, afterScreenUpdates: true) }
        let attachment = XCTAttachment(image: image)
        attachment.name = "Native Starter and Pro purchase screen - local StoreKit"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
