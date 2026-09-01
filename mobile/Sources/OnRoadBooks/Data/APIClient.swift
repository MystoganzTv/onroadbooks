import Foundation

/// The one place that knows how to talk to `/api/mobile/*`: the base URL, the
/// bearer token, and what a response means. `APIRepository` uses it for live
/// requests and `WriteQueue` uses it to replay the ones that had to wait, so a
/// queued write is sent by exactly the same code path as an immediate one.
struct APIClient {
    let baseURL: URL
    let tokenProvider: () -> String?

    func request(_ path: String, method: String) -> URLRequest {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        if let token = tokenProvider() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    func post(_ path: String, body: Data) -> URLRequest {
        var request = self.request(path, method: "POST")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        return request
    }

    /// Throws `APIError` for anything that is not a usable HTTP response.
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw APIError.requestFailed }
            return (data, http)
        } catch let error as URLError {
            throw APIError.transport(TransportFailure(error))
        }
    }

    /// Reads the `{ id }` a write route answers with, or turns the
    /// `{ error, fieldErrors }` it refused with into a sentence for the owner.
    /// A 4xx here is the ledger saying no, which retrying will not fix.
    static func outcome(_ data: Data, _ http: HTTPURLResponse) throws -> String {
        if http.statusCode == 401 { throw APIError.unauthorized }
        if http.statusCode == 200 || http.statusCode == 201 {
            guard let created = try? JSONDecoder().decode(CreatedResponse.self, from: data) else {
                throw APIError.decodingFailed
            }
            return created.id
        }
        if let refusal = try? JSONDecoder().decode(RefusalResponse.self, from: data) {
            let field = refusal.fieldErrors?.sorted(by: { $0.key < $1.key }).first
            throw APIError.refused(field.map { "\($0.value)" } ?? refusal.error)
        }
        throw APIError.requestFailed
    }
}

struct CreatedResponse: Decodable { let id: String }

struct RefusalResponse: Decodable {
    let error: String
    let fieldErrors: [String: String]?
}

/// Why a request never produced an answer — and, crucially, whether the server
/// could have acted on it anyway.
///
/// A truck loses signal for hours, so most failures out here happen before a
/// single byte leaves the phone: those are safe to hold and send later. But a
/// connection that dies mid-flight is genuinely ambiguous — the ledger may
/// already hold that expense. Retrying it blind is how a $412 fill-up becomes
/// $824, so those never retry themselves; they wait for the owner, who is the
/// only one who can go look.
struct TransportFailure {
    let code: URLError.Code
    let message: String

    init(_ error: URLError) {
        code = error.code
        message = error.localizedDescription
    }

    /// The request provably never reached the server.
    var neverSent: Bool {
        switch code {
        case .notConnectedToInternet, .cannotConnectToHost, .cannotFindHost,
             .dnsLookupFailed, .internationalRoamingOff, .dataNotAllowed,
             .callIsActive, .secureConnectionFailed:
            return true
        default:
            return false
        }
    }
}
