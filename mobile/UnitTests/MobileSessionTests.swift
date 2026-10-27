import XCTest
@testable import OnRoad_Books

private final class SessionHTTPStub: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host?.hasSuffix(".example.test") == true
    }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let status = request.url!.lastPathComponent == "forbidden" ? 403 : 401
        client?.urlProtocol(self, didReceive: HTTPURLResponse(
            url: request.url!, statusCode: status, httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data("{\"error\":\"Unauthorized\"}".utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@MainActor
final class MobileSessionTests: XCTestCase {
    private let baseURL = URL(string: "https://session.example.test")!

    private func session() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [SessionHTTPStub.self]
        return URLSession(configuration: config)
    }

    func testDashboardUnauthorizedRequestsReauthenticationAndKeepsActualError() async {
        let notified = expectation(description: "Rejected session is delivered on the main thread")
        let observer = NotificationCenter.default.addObserver(
            forName: APIClient.sessionRejected, object: nil, queue: nil
        ) { note in
            XCTAssertTrue(Thread.isMainThread)
            XCTAssertEqual(note.object as? String, "expired-test-token")
            notified.fulfill()
        }
        defer { NotificationCenter.default.removeObserver(observer) }
        let repository = APIRepository(baseURL: baseURL, tokenProvider: { "expired-test-token" }, session: session())
        let dashboard = DashboardViewModel(repository: repository)

        await dashboard.load()

        XCTAssertNil(dashboard.snapshot)
        XCTAssertFalse(dashboard.isLoading)
        XCTAssertEqual(dashboard.refreshFailure, APIError.unauthorized.errorDescription)
        await fulfillment(of: [notified], timeout: 1)
    }

    func testRejectionIdentifiesTheTokenSentBeforeANewLogin() async throws {
        var token = "old-test-token"
        let client = APIClient(baseURL: baseURL, tokenProvider: { token }, session: session())
        let request = client.request("api/mobile/dashboard", method: "GET")
        token = "new-test-token"
        let notified = expectation(description: "Old response identifies only the old session")
        let observer = NotificationCenter.default.addObserver(
            forName: APIClient.sessionRejected, object: nil, queue: nil
        ) { note in
            XCTAssertEqual(note.object as? String, "old-test-token")
            notified.fulfill()
        }
        defer { NotificationCenter.default.removeObserver(observer) }

        _ = try await client.send(request)

        await fulfillment(of: [notified], timeout: 1)
    }

    func testOtherFailuresDoNotInvalidateTheSession() async throws {
        let notified = expectation(description: "Unrelated responses do not reject the session")
        notified.isInverted = true
        let observer = NotificationCenter.default.addObserver(
            forName: APIClient.sessionRejected, object: nil, queue: nil
        ) { _ in notified.fulfill() }
        defer { NotificationCenter.default.removeObserver(observer) }
        let client = APIClient(baseURL: baseURL, tokenProvider: { "test-token" }, session: session())

        // A plan/permission refusal is not an invalid session.
        _ = try await client.send(client.request("api/mobile/forbidden", method: "GET"))
        // A signed storage URL has its own authentication.
        var external = client.request("api/mobile/dashboard", method: "GET")
        external.url = URL(string: "https://storage.example.test/api/mobile/dashboard")!
        _ = try await client.send(external)
        // Public requests and non-API responses cannot log the owner out.
        _ = try await client.send(URLRequest(url: baseURL.appendingPathComponent("api/mobile/dashboard")))
        _ = try await client.send(client.request("document", method: "GET"))

        await fulfillment(of: [notified], timeout: 0.1)
    }
}
