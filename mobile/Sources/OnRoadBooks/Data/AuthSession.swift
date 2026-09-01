import Foundation

/// Holds the mobile access token (a signed session, identical format to
/// the web app's cookie — see `getMobileSession` in the web repo's
/// `src/lib/auth/mobile.ts`) and the login flow that fetches one.
@MainActor
final class AuthSession: ObservableObject {
    @Published private(set) var token: String?
    /// The signed-in email, straight from `/api/mobile/login`'s response —
    /// never hardcoded. Persisted alongside the token (in UserDefaults, not
    /// the Keychain — it's not a secret) so it survives a cold launch.
    @Published private(set) var email: String?
    /// The account's name, exactly as the ledger holds it — used for the
    /// greeting. Null when the account has no name, and the app then greets
    /// without one. It is never derived from the email address: guessing
    /// "Enrique" out of "enrique.padron853@gmail.com" is the same class of
    /// invention as the hardcoded business name this app already got wrong.
    @Published private(set) var name: String?
    @Published var isAuthenticating = false
    @Published var lastError: String?

    fileprivate static let tokenKey = "onroadbooks.mobile.token"
    private let keychainKey = AuthSession.tokenKey
    private let emailDefaultsKey = "onroadbooks.mobile.email"
    private let nameDefaultsKey = "onroadbooks.mobile.name"
    /// Held for the length of the browser flow: ASWebAuthenticationSession
    /// keeps only a weak reference to its presentation context provider.
    private var webSignIn: WebSignIn?

    /// The token straight from the Keychain, with no `AuthSession` instance
    /// needed. `WriteQueue` outlives any one screen and is built before the
    /// session object exists, so it reads the store rather than an object —
    /// and a token refreshed by a new login is picked up automatically.
    static func storedToken() -> String? { KeychainHelper.read(key: tokenKey) }

    init() {
        token = KeychainHelper.read(key: keychainKey)
        email = UserDefaults.standard.string(forKey: emailDefaultsKey)
        name = UserDefaults.standard.string(forKey: nameDefaultsKey)
    }

    /// First name only, for a greeting that reads like a person wrote it.
    var firstName: String? {
        guard let first = name?.split(separator: " ").first, !first.isEmpty else { return nil }
        return String(first)
    }

    var isAuthenticated: Bool { token != nil }

    func login(email: String, password: String) async {
        guard !email.isEmpty, !password.isEmpty else {
            lastError = "Ingresa tu correo y contraseña."
            return
        }
        isAuthenticating = true
        lastError = nil
        defer { isAuthenticating = false }

        do {
            var request = URLRequest(url: APIConfig.baseURL.appendingPathComponent("api/mobile/login"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(["email": email, "password": password])

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                lastError = "No se pudo conectar. Inténtalo de nuevo."
                return
            }
            guard http.statusCode == 200 else {
                let body = try? JSONDecoder().decode([String: String].self, from: data)
                lastError = body?["error"] ?? "Correo o contraseña incorrectos."
                return
            }
            let decoded = try JSONDecoder().decode(LoginResponse.self, from: data)
            store(token: decoded.token, email: decoded.email, name: decoded.name)
        } catch {
            lastError = "No se pudo conectar con OnRoad Books. Revisa tu conexión."
        }
    }

    /// Sign in with Google, through the same web page the browser uses.
    ///
    /// There is no Google SDK here and no second OAuth client: the app opens
    /// the real sign-in page and comes back with a code it alone can redeem.
    /// See `WebSignIn` and `src/lib/auth/mobile-handoff.ts`.
    func continueWithGoogle() async {
        isAuthenticating = true
        lastError = nil
        defer { isAuthenticating = false }

        let flow = WebSignIn()
        webSignIn = flow
        defer { webSignIn = nil }

        do {
            let credentials = try await flow.start()
            store(token: credentials.token, email: credentials.email, name: credentials.name)
        } catch WebSignIn.Failure.cancelled {
            // He closed the sheet. Not something to shout about.
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription
                ?? "No se pudo iniciar sesión con Google."
        }
    }

    /// One place where a signed-in session is written, whichever door it came
    /// through — the token in the Keychain, the display fields beside it.
    private func store(token newToken: String, email newEmail: String, name newName: String?) {
        KeychainHelper.save(key: keychainKey, value: newToken)
        UserDefaults.standard.set(newEmail, forKey: emailDefaultsKey)
        if let newName {
            UserDefaults.standard.set(newName, forKey: nameDefaultsKey)
        } else {
            UserDefaults.standard.removeObject(forKey: nameDefaultsKey)
        }
        token = newToken
        email = newEmail
        name = newName
    }

    func logout() {
        KeychainHelper.delete(key: keychainKey)
        UserDefaults.standard.removeObject(forKey: emailDefaultsKey)
        UserDefaults.standard.removeObject(forKey: nameDefaultsKey)
        token = nil
        email = nil
        name = nil
    }
}

private struct LoginResponse: Decodable {
    let token: String
    let expiresAt: String
    let email: String
    let name: String?
}
