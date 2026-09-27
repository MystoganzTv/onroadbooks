import SwiftUI

struct SettingsView: View {
    let repository: LedgerRepository
    let accountLabel: String
    var queue: WriteQueue? = nil
    @ObservedObject var appLock: AppLock
    var onSignOut: (() -> Void)?

    @AppStorage("onroadbooks.appearance") private var appearance = "dark"
    @AppStorage("onroadbooks.textSize") private var textSize = "system"
    @State private var lockSetupFailed = false

    var body: some View {
        List {
            Section {
                Text(accountLabel)
                    .font(.headline)
                    .foregroundStyle(OBColor.foreground)
                    .padding(.vertical, 4)
                    .listRowBackground(OBColor.card)
                NavigationLink {
                    TeamView(repository: repository)
                } label: {
                    Label("Access & Roles", systemImage: "person.3.fill")
                        .foregroundStyle(OBColor.foreground)
                }
                .listRowBackground(OBColor.card)
            } header: {
                Text("Account").foregroundStyle(OBColor.mutedForeground)
            }

            Section("Negocio") {
                NavigationLink("Negocio y finanzas") {
                    ManagementView(repository: repository, resource: "settings", title: "Negocio y finanzas")
                }
                NavigationLink("Metas") {
                    ManagementView(repository: repository, resource: "goals", title: "Metas")
                }
            }

            Section {
                Picker("Apariencia", selection: $appearance) {
                    Text("Sistema").tag("system")
                    Text("Claro").tag("light")
                    Text("Oscuro").tag("dark")
                }
                .accessibilityIdentifier("appearance-picker")
                Picker("Tamaño del texto", selection: $textSize) {
                    Text("Del dispositivo").tag("system")
                    Text("Grande").tag("large")
                    Text("Muy grande").tag("extraLarge")
                }
                LabeledRow(title: "Moneda del libro", value: "USD")
            } header: {
                Text("Preferences").foregroundStyle(OBColor.mutedForeground)
            }

            // A phone leaves a pocket more than a laptop leaves a desk. Off by
            // default -- see AppLock.enable(), which proves this actually
            // works on his phone before the switch takes hold.
            if appLock.isAvailable {
                Section {
                    Toggle(isOn: Binding(
                        get: { appLock.isEnabled },
                        set: { wantsOn in
                            if wantsOn {
                                Task {
                                    let ok = await appLock.enable()
                                    lockSetupFailed = !ok
                                }
                            } else {
                                appLock.disable()
                            }
                        }
                    )) {
                        Text("Bloqueo de la app").foregroundStyle(OBColor.foreground)
                    }
                    .tint(OBColor.primary)
                    .listRowBackground(OBColor.card)
                } header: {
                    Text("Security").foregroundStyle(OBColor.mutedForeground)
                } footer: {
                    Text("Pide Face ID, Touch ID o tu código al volver a abrir la app.")
                        .foregroundStyle(OBColor.mutedForeground)
                }
            }

            Section("Datos y cuenta") {
                NavigationLink("Restablecer o eliminar cuenta") {
                    AccountDataView(repository: repository, queue: queue, onSignOut: onSignOut)
                }
            }

            Section {
                LabeledRow(title: "Version", value: "\(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—") (\(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "—"))")
                if let onSignOut {
                    Button(role: .destructive) {
                        onSignOut()
                    } label: {
                        Text("Sign Out").foregroundStyle(OBColor.neg)
                    }
                    .listRowBackground(OBColor.card)
                } else {
                    Text("Modo de muestra — no hay sesión que cerrar.")
                        .font(.caption)
                        .foregroundStyle(OBColor.mutedForeground)
                        .listRowBackground(OBColor.card)
                }
            } header: {
                Text("About").foregroundStyle(OBColor.mutedForeground)
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(OBColor.background)
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .alert("No se pudo activar", isPresented: $lockSetupFailed) {
            Button("Entendido") {}
        } message: {
            Text("No se pudo verificar tu identidad. Inténtalo de nuevo.")
        }
    }
}

private struct LabeledRow: View {
    let title: String
    let value: String
    var body: some View {
        HStack {
            Text(title).foregroundStyle(OBColor.foreground)
            Spacer()
            Text(value).foregroundStyle(OBColor.mutedForeground)
        }
        .listRowBackground(OBColor.card)
    }
}
