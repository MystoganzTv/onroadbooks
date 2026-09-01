import SwiftUI

struct LoginView: View {
    @ObservedObject var authSession: AuthSession
    let onUseDemo: () -> Void

    @State private var email = ""
    @State private var password = ""
    @FocusState private var focusedField: Field?
    private enum Field { case email, password }

    var body: some View {
        ScrollView {
            VStack(spacing: OBSpacing.lg) {
                Spacer(minLength: 60)

                VStack(spacing: 6) {
                    Image(systemName: "gauge.with.dots.needle.67percent")
                        .font(.system(size: 40))
                        .foregroundStyle(OBColor.primary)
                    Text("OnRoad Books")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(OBColor.foreground)
                    Text("Bookkeeping built for the road.")
                        .font(.subheadline)
                        .foregroundStyle(OBColor.mutedForeground)
                }

                VStack(spacing: OBSpacing.sm) {
                    Button {
                        focusedField = nil
                        Task { await authSession.continueWithGoogle() }
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "globe")
                                .font(.subheadline.weight(.semibold))
                            Text("Continuar con Google").fontWeight(.semibold)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, OBSpacing.sm + 2)
                    }
                    .background(OBColor.surfaceRaised, in: RoundedRectangle(cornerRadius: OBRadius.control))
                    .overlay(
                        RoundedRectangle(cornerRadius: OBRadius.control)
                            .stroke(OBColor.border, lineWidth: 1)
                    )
                    .foregroundStyle(OBColor.foreground)
                    .disabled(authSession.isAuthenticating)

                    Button("Usar otra cuenta de Google") {
                        focusedField = nil
                        Task { await authSession.continueWithGoogle(freshSession: true) }
                    }
                    .font(.footnote)
                    .foregroundStyle(OBColor.mutedForeground)
                    .frame(maxWidth: .infinity)
                    .disabled(authSession.isAuthenticating)

                    HStack(spacing: OBSpacing.sm) {
                        Rectangle().fill(OBColor.border).frame(height: 1)
                        Text("o con tu contraseña")
                            .font(.caption)
                            .foregroundStyle(OBColor.mutedForeground)
                            .fixedSize()
                        Rectangle().fill(OBColor.border).frame(height: 1)
                    }
                    .padding(.vertical, 2)

                    TextField("Correo", text: $email)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focusedField, equals: .email)
                        .padding(OBSpacing.md)
                        .background(OBColor.surfaceRaised, in: RoundedRectangle(cornerRadius: OBRadius.control))
                        .foregroundStyle(OBColor.foreground)

                    SecureField("Contraseña", text: $password)
                        .textContentType(.password)
                        .focused($focusedField, equals: .password)
                        .padding(OBSpacing.md)
                        .background(OBColor.surfaceRaised, in: RoundedRectangle(cornerRadius: OBRadius.control))
                        .foregroundStyle(OBColor.foreground)

                    if let error = authSession.lastError {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(OBColor.neg)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Button {
                        focusedField = nil
                        Task { await authSession.login(email: email, password: password) }
                    } label: {
                        HStack {
                            if authSession.isAuthenticating {
                                ProgressView().tint(OBColor.primaryForeground)
                            } else {
                                Text("Entrar").fontWeight(.semibold)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, OBSpacing.sm + 2)
                    }
                    .background(OBColor.primary, in: RoundedRectangle(cornerRadius: OBRadius.control))
                    .foregroundStyle(OBColor.primaryForeground)
                    .disabled(authSession.isAuthenticating)
                }
                .padding(.horizontal, OBSpacing.md)

                Button("Ver con datos de muestra", action: onUseDemo)
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(OBColor.mutedForeground)

                Spacer(minLength: 40)
            }
        }
        .background(OBColor.background)
        .scrollDismissesKeyboard(.interactively)
    }
}
