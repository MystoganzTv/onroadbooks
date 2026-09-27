import SwiftUI

/// Uses the same public, rate-limited auth endpoints as the website. Neither
/// recovery tokens nor passwords are persisted in preferences or logs.
struct AccountAccessView: View {
    enum Flow: String, Identifiable {
        case register, recover, invitation
        var id: String { rawValue }
    }
    let flow: Flow
    @ObservedObject var authSession: AuthSession
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var businessName = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var recoveryLink = ""
    @State private var hasRecoveryLink = false
    @State private var pending = false
    @State private var failure: String?
    @State private var notice: String?
    @State private var completed = false
    @State private var accountCreated = false

    var body: some View {
        NavigationStack {
            Form {
                if accountCreated {
                    Section {
                        Text("Cuenta creada. Ya puedes iniciar sesión.")
                        Button("Volver a iniciar sesión") { dismiss() }
                    }
                } else if completed {
                    Section {
                        Text(flow == .invitation ? "Invitación aceptada. Inicia sesión con el correo invitado y la contraseña que acabas de crear." : "Contraseña actualizada. Ya puedes iniciar sesión con la nueva contraseña.")
                        Button("Volver a iniciar sesión") { dismiss() }
                    }
                } else {
                    if flow == .register {
                        Section("Tu negocio") {
                            TextField("Tu nombre", text: $name).textContentType(.name)
                            TextField("Nombre del negocio", text: $businessName).textContentType(.organizationName)
                        }
                    } else if flow == .recover {
                        Toggle("Ya tengo el enlace de recuperación", isOn: $hasRecoveryLink)
                    }
                    if flow == .register || (flow == .recover && !hasRecoveryLink) {
                        TextField("Correo", text: $email)
                            .keyboardType(.emailAddress).textContentType(.emailAddress)
                            .textInputAutocapitalization(.never).autocorrectionDisabled()
                            .accessibilityIdentifier("account-access-email")
                    }
                    if flow == .invitation || (flow == .recover && hasRecoveryLink) {
                        Section {
                            TextField("Enlace del correo", text: $recoveryLink, axis: .vertical)
                                .textInputAutocapitalization(.never).autocorrectionDisabled()
                        } footer: {
                            Text(flow == .invitation ? "Copia aquí el enlace del correo de invitación a tu negocio." : "Copia aquí el enlace del correo de recuperación. Caduca en 30 minutos y solo se puede usar una vez.")
                        }
                    }
                    if flow != .recover || hasRecoveryLink {
                        Section {
                            SecureField("Contraseña nueva", text: $password).textContentType(.newPassword)
                            SecureField("Repetir contraseña", text: $confirmPassword).textContentType(.newPassword)
                        } footer: {
                            Text("Usa al menos 10 caracteres.")
                        }
                    }
                    if let failure { Text(failure).foregroundStyle(OBColor.neg) }
                    if let notice { Text(notice).foregroundStyle(OBColor.foreground) }
                    Section {
                        Button {
                            Task { await submit() }
                        } label: {
                            if pending { ProgressView() }
                            else { Text(flow == .register ? "Crear cuenta" : flow == .invitation ? "Aceptar invitación" : hasRecoveryLink ? "Guardar contraseña" : "Enviar enlace de recuperación") }
                        }
                        .disabled(pending)
                        .accessibilityIdentifier("account-access-submit")
                    }
                }
            }
            .disabled(pending)
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle(flow == .register ? "Crear cuenta" : flow == .invitation ? "Aceptar invitación" : "Recuperar acceso")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cerrar") { dismiss() }.disabled(pending)
                }
            }
        }
        .interactiveDismissDisabled(pending)
    }

    @MainActor private func submit() async {
        failure = nil; notice = nil
        if flow != .recover || hasRecoveryLink {
            guard password.count >= 10, password.count <= 200 else {
                failure = "Usa una contraseña de entre 10 y 200 caracteres."; return
            }
            guard password == confirmPassword else { failure = "Las contraseñas no coinciden."; return }
        }
        let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        pending = true
        defer { pending = false }
        do {
            if flow == .register {
                let business = businessName.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !business.isEmpty else { failure = "Escribe el nombre del negocio."; return }
                try await post("setup", values: ["name": name, "businessName": business, "email": cleanEmail, "password": password])
                await authSession.login(email: cleanEmail, password: password)
                if authSession.isAuthenticated { dismiss() }
                else {
                    // The account exists even if the second request lost its
                    // connection. Do not encourage creating it a second time.
                    accountCreated = true
                    password = ""; confirmPassword = ""
                }
            } else if flow == .invitation || hasRecoveryLink {
                guard let link = URLComponents(string: recoveryLink.trimmingCharacters(in: .whitespacesAndNewlines)),
                      link.scheme == "https" || link.scheme == "http",
                      link.host == APIConfig.baseURL.host,
                      link.path == (flow == .invitation ? "/invite/accept" : "/reset-password"),
                      let fragment = link.fragment,
                      let token = URLComponents(string: "?" + fragment)?.queryItems?.first(where: { $0.name == "token" })?.value else {
                    failure = "Pega el enlace completo del correo de OnRoad Books."; return
                }
                try await post(flow == .invitation ? "invite/accept" : "reset-password", values: ["token": token, "password": password])
                password = ""; confirmPassword = ""; recoveryLink = ""
                completed = true
            } else {
                try await post("forgot-password", values: ["email": cleanEmail, "locale": "es"])
                notice = "Si ese correo tiene una cuenta con contraseña, recibirás un enlace para recuperarla. Revisa también la carpeta de spam."
            }
        } catch { failure = error.localizedDescription }
    }

    private func post(_ endpoint: String, values: [String: String]) async throws {
        var request = URLRequest(url: APIConfig.baseURL.appendingPathComponent("api/auth/" + endpoint))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(values)
        request.timeoutInterval = 30
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard (200..<300).contains(http.statusCode) else {
            struct ErrorBody: Decodable { let error: String }
            let message = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error ?? "No se pudo completar la solicitud."
            throw NSError(domain: "OnRoadBooks.Auth", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: message])
        }
    }
}
