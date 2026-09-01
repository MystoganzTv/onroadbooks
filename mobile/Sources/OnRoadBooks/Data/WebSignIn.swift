import UIKit
import AuthenticationServices
import CryptoKit
import Foundation

/// Signing in with Google, without a second Google client.
///
/// The app opens the real OnRoad Books sign-in page inside an
/// `ASWebAuthenticationSession`. Google, the nonce, Supabase and the registered
/// JavaScript origin are the ones that already work in a browser — nothing
/// about identity is reimplemented here, which is why this needed no new OAuth
/// client, no SDK, and no change in Google Cloud Console.
///
/// What comes back through the callback is a code, not a session. A custom URL
/// scheme can be claimed by any app on the device, so a token travelling that
/// way would be a ledger handed to whoever registered it first. The code is
/// bound to a challenge whose verifier never leaves this process, and the
/// scheme is deliberately NOT declared in Info.plist: an
/// `ASWebAuthenticationSession` captures its own callback, and registering it
/// system-wide is exactly what would let another app receive it.
@MainActor
final class WebSignIn: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?

    struct Credentials {
        let token: String
        let email: String
        let name: String?
    }

    enum Failure: LocalizedError {
        case cancelled
        case mismatched
        case failed(String)

        var errorDescription: String? {
            switch self {
            case .cancelled: return nil
            case .mismatched: return "La respuesta no corresponde a este inicio de sesión."
            case .failed(let message): return message
            }
        }
    }

    /// - Parameter freshSession: start with no cookies at all. Google then
    ///   shows its account chooser instead of "Continue as …": with Safari's
    ///   session shared, whoever is already signed in on the phone is the only
    ///   account offered, and there is no way past it. This is that way past.
    func start(freshSession: Bool = false) async throws -> Credentials {
        let verifier = Self.randomToken()
        let state = Self.randomToken()
        let challenge = Self.challenge(for: verifier)

        var components = URLComponents(
            url: APIConfig.baseURL.appendingPathComponent("api/auth/mobile-handoff"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "challenge", value: challenge),
        ]
        guard let url = components?.url else { throw Failure.failed("No se pudo abrir el inicio de sesión.") }

        let callback = try await authenticate(url: url, freshSession: freshSession)
        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        guard items.first(where: { $0.name == "state" })?.value == state else { throw Failure.mismatched }
        guard let code = items.first(where: { $0.name == "code" })?.value else {
            throw Failure.failed("El inicio de sesión no se completó.")
        }

        return try await exchange(code: code, verifier: verifier)
    }

    private func authenticate(url: URL, freshSession: Bool) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: "onroadbooks"
            ) { callback, error in
                if let callback {
                    continuation.resume(returning: callback)
                } else if let error = error as? ASWebAuthenticationSessionError,
                          error.code == .canceledLogin {
                    continuation.resume(throwing: Failure.cancelled)
                } else {
                    continuation.resume(throwing: Failure.failed("No se pudo abrir el inicio de sesión."))
                }
            }
            session.presentationContextProvider = self
            // By default use whatever Safari already knows: if he is signed in
            // to onroadbooks.com on this phone, this is one tap. Ephemeral
            // throws all of that away, which is the only way to reach Google's
            // account chooser.
            session.prefersEphemeralWebBrowserSession = freshSession
            self.session = session
            if !session.start() {
                continuation.resume(throwing: Failure.failed("No se pudo abrir el inicio de sesión."))
            }
        }
    }

    private func exchange(code: String, verifier: String) async throws -> Credentials {
        var request = URLRequest(url: APIConfig.baseURL.appendingPathComponent("api/mobile/auth/exchange"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["code": code, "verifier": verifier])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw Failure.failed("No se pudo conectar con OnRoad Books.")
        }
        guard http.statusCode == 200 else {
            let body = try? JSONDecoder().decode([String: String].self, from: data)
            throw Failure.failed(body?["error"] ?? "El inicio de sesión expiró. Inténtalo de nuevo.")
        }
        let decoded = try JSONDecoder().decode(ExchangeResponse.self, from: data)
        return Credentials(token: decoded.token, email: decoded.email, name: decoded.name)
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }

    /// 32 random bytes, base64url — long enough that guessing a challenge is
    /// not a thing anyone attempts.
    private static func randomToken() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).base64URLEncoded()
    }

    private static func challenge(for verifier: String) -> String {
        Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncoded()
    }
}

private struct ExchangeResponse: Decodable {
    let token: String
    let expiresAt: String
    let email: String
    let name: String?
}

extension Data {
    /// Base64url, matching what the server's `base64url` digests produce.
    func base64URLEncoded() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
