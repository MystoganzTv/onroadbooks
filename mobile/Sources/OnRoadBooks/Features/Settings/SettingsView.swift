import SwiftUI

struct SettingsView: View {
    let repository: LedgerRepository
    let accountLabel: String
    var onSignOut: (() -> Void)?

    var body: some View {
        List {
            Section {
                // Real email when signed in, "Datos de muestra" in demo mode
                // — never a hardcoded business name. Plan/business name isn't
                // returned by any /api/mobile/* route yet.
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

            Section {
                LabeledRow(title: "Appearance", value: "Dark")
                LabeledRow(title: "Currency", value: "USD")
                LabeledRow(title: "Text size", value: "Default")
            } header: {
                Text("Preferences").foregroundStyle(OBColor.mutedForeground)
            }

            Section {
                LabeledRow(title: "Version", value: "1.0 (1)")
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
