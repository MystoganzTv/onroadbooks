import SwiftUI

/// Shown over everything else while `AppLock` says the current foreground
/// session is not yet unlocked. Prompts once on appear -- unlocking is
/// meant to be one glance and a thumb, not a second tap to ask for it.
struct AppLockView: View {
    @ObservedObject var lock: AppLock
    var onSignOut: (() -> Void)?

    @State private var didFail = false

    var body: some View {
        VStack(spacing: OBSpacing.lg) {
            Spacer()

            Image(systemName: "lock.fill")
                .font(.system(size: 40))
                .foregroundStyle(OBColor.primary)

            VStack(spacing: 4) {
                Text("OnRoad Books")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(OBColor.foreground)
                Text(didFail ? "No se pudo verificar. Inténtalo de nuevo." : "Bloqueado")
                    .font(.subheadline)
                    .foregroundStyle(didFail ? OBColor.neg : OBColor.mutedForeground)
            }

            Button {
                Task { await attempt() }
            } label: {
                Text("Desbloquear")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(OBColor.primary)
            .padding(.horizontal, OBSpacing.xl)

            Spacer()

            if let onSignOut {
                Button("Cerrar sesión", role: .destructive, action: onSignOut)
                    .font(.footnote)
                    .foregroundStyle(OBColor.mutedForeground)
                    .buttonStyle(.plain)
                    .padding(.bottom, OBSpacing.lg)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(OBColor.background)
        .task { await attempt() }
    }

    private func attempt() async {
        let success = await lock.authenticate()
        didFail = !success
    }
}
