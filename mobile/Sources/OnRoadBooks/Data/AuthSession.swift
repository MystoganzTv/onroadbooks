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
    @Published var isAuthenticating = false
    @Published var lastError: String?

    private let keychainKey = "onroadbooks.mobile.token"
    private let emailDefaultsKey = "onroadbooks.mobile.email"

    init() {
        token = KeychainHelper.read(key: keychainKey)
        email = UserDefaults.standard.string(forKey: emailDefaultsKey)
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
            KeychainHelper.save(key: keychainKey, value: decoded.token)
            UserDefaults.standard.set(decoded.email, forKey: emailDefaultsKey)
            token = decoded.token
            self.email = decoded.email  // "email" the parameter shadows "email" the property here, so this must be self.email
        } catch {
            lastError = "No se pudo conectar con OnRoad Books. Revisa tu conexión."
        }
    }

    func logout() {
        KeychainHelper.delete(key: keychainKey)
        UserDefaults.standard.removeObject(forKey: emailDefaultsKey)
        token = nil
        email = nil
    }
}

private struct LoginResponse: Decodable {
    let token: String
    let expiresAt: String
    let email: String
}
