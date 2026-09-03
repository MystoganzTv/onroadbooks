import SwiftUI

/// Who has an app sign-in, and what they can do with it -- the mobile half of
/// the web's `/settings#access-roles` section (`TeamManager`).
///
/// Access & Roles is a Fleet-plan capability there (`hasFleetAccess`), so it
/// is one here too: a Solo/Pro account gets the same locked state Reserves
/// shows for a plan gate, not a second, looser rule for the phone. See
/// project memory `onroadbooks_team.md` -- this is exactly the screen behind
/// "invite my accountant as a free Bookkeeper" once Fleet access is granted.
struct TeamView: View {
    let repository: LedgerRepository

    @State private var roster: TeamRoster?
    @State private var isLoading = true
    @State private var failure: String?
    /// True only when the server refused on purpose (the Fleet plan gate),
    /// which reads very differently from a dropped connection.
    @State private var locked = false
    @State private var showInvite = false
    @State private var pendingAction: String?
    @State private var pendingRemoval: TeamMember?
    @State private var actionMessage: (ok: Bool, text: String)?

    var body: some View {
        Group {
            if isLoading {
                ProgressView().tint(OBColor.primary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let failure {
                VStack(spacing: OBSpacing.sm) {
                    Image(systemName: locked ? "lock.fill" : "wifi.exclamationmark")
                        .font(.system(size: 30))
                        .foregroundStyle(OBColor.mutedForeground)
                    Text(failure)
                        .font(.subheadline)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(OBColor.mutedForeground)
                        .padding(.horizontal, OBSpacing.lg)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let roster {
                content(roster)
            } else {
                OBUnavailableView(title: "Accesos y roles")
            }
        }
        .background(OBColor.background)
        .navigationTitle("Access & Roles")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if roster?.canManage == true {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showInvite = true
                    } label: {
                        Image(systemName: "person.badge.plus")
                    }
                }
            }
        }
        .task { await reload() }
        .refreshable { await reload() }
        .sheet(isPresented: $showInvite) {
            InviteTeamMemberView(repository: repository) {
                Task { await reload() }
            }
        }
        .confirmationDialog(
            pendingRemoval.map { "¿Quitar a \($0.displayName) de este workspace?" } ?? "",
            isPresented: Binding(get: { pendingRemoval != nil }, set: { if !$0 { pendingRemoval = nil } }),
            titleVisibility: .visible
        ) {
            Button("Quitar acceso", role: .destructive) {
                if let member = pendingRemoval { remove(member) }
                pendingRemoval = nil
            }
            Button("Cancelar", role: .cancel) { pendingRemoval = nil }
        }
        .alert(
            actionMessage?.ok == true ? "Listo" : "No se pudo completar",
            isPresented: Binding(get: { actionMessage != nil }, set: { if !$0 { actionMessage = nil } })
        ) {
            Button("Entendido") { actionMessage = nil }
        } message: {
            Text(actionMessage?.text ?? "")
        }
    }

    @ViewBuilder
    private func content(_ roster: TeamRoster) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: OBSpacing.lg) {
                Text("Los sign-ins de la app son para colaboración continua. Agregar un conductor nunca crea acceso a la app.")
                    .font(.caption)
                    .foregroundStyle(OBColor.mutedForeground)
                    .padding(.horizontal, OBSpacing.md)

                VStack(spacing: 0) {
                    ForEach(Array(roster.members.enumerated()), id: \.element.id) { index, member in
                        MemberRow(
                            member: member,
                            canManage: roster.canManage,
                            isBusy: pendingAction == member.id,
                            onRoleChange: { role in changeRole(member, to: role) },
                            onRemoveRequested: { pendingRemoval = member }
                        )
                        .padding(.horizontal, OBSpacing.md)
                        .padding(.vertical, OBSpacing.sm)
                        if index < roster.members.count - 1 {
                            Rectangle().fill(OBColor.border).frame(height: 1)
                                .padding(.leading, OBSpacing.md)
                        }
                    }
                }
                .obPanel()
                .padding(.horizontal, OBSpacing.md)

                if roster.canManage {
                    Button {
                        showInvite = true
                    } label: {
                        Label("Invitar a alguien", systemImage: "person.badge.plus")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(OBColor.primary)
                    .padding(.horizontal, OBSpacing.md)
                }

                Spacer(minLength: OBSpacing.xl)
            }
            .padding(.top, OBSpacing.sm)
        }
    }

    private func reload() async {
        do {
            roster = try await repository.fetchTeam()
            failure = nil
            locked = false
        } catch {
            if case APIError.refused(let message) = error {
                failure = message
                locked = true
            } else {
                failure = (error as? LocalizedError)?.errorDescription
                    ?? "No se pudo cargar el equipo."
                locked = false
            }
        }
        isLoading = false
    }

    private func changeRole(_ member: TeamMember, to role: AssignableRole) {
        pendingAction = member.id
        Task {
            do {
                try await repository.updateTeamMemberRole(userId: member.id, role: role)
                await reload()
            } catch {
                actionMessage = (
                    false,
                    (error as? LocalizedError)?.errorDescription ?? "No se pudo cambiar el rol."
                )
            }
            pendingAction = nil
        }
    }

    private func remove(_ member: TeamMember) {
        pendingAction = member.id
        Task {
            do {
                try await repository.removeTeamMember(userId: member.id)
                actionMessage = (true, "\(member.displayName) ya no tiene acceso. Sus sesiones quedaron revocadas.")
                await reload()
            } catch {
                actionMessage = (
                    false,
                    (error as? LocalizedError)?.errorDescription ?? "No se pudo quitar a ese miembro."
                )
            }
            pendingAction = nil
        }
    }
}

private struct MemberRow: View {
    let member: TeamMember
    let canManage: Bool
    let isBusy: Bool
    let onRoleChange: (AssignableRole) -> Void
    let onRemoveRequested: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: OBSpacing.sm) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(member.displayName)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(OBColor.foreground)
                    if member.role != .owner {
                        StatusPill(text: member.joinedAt != nil ? "Activo" : "Invitación pendiente", isActive: member.joinedAt != nil)
                    }
                }
                Text(member.email)
                    .font(.caption)
                    .foregroundStyle(OBColor.mutedForeground)
                Text(member.role.roleDescription)
                    .font(.caption2)
                    .foregroundStyle(OBColor.mutedForeground)
            }

            Spacer(minLength: OBSpacing.sm)

            if member.role == .owner {
                Text("Dueño")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(OBColor.info)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(OBColor.infoSoft, in: Capsule())
            } else if isBusy {
                ProgressView().tint(OBColor.primary)
            } else if canManage {
                VStack(alignment: .trailing, spacing: 6) {
                    Menu {
                        ForEach(AssignableRole.allCases) { option in
                            Button(option.label) { onRoleChange(option) }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Text(member.role.label)
                            Image(systemName: "chevron.up.chevron.down")
                        }
                        .font(.caption.weight(.medium))
                        .foregroundStyle(OBColor.foreground)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(OBColor.surfaceRaised, in: Capsule())
                    }
                    Button("Quitar", role: .destructive, action: onRemoveRequested)
                        .font(.caption2.weight(.medium))
                        .buttonStyle(.plain)
                        .foregroundStyle(OBColor.neg)
                }
            }
        }
    }
}

/// Same three fields as `TeamManager`'s invite form on the web: email, an
/// optional name, and a role from `ASSIGNABLE_ROLES` -- never OWNER, and
/// never the legacy VIEWER.
private struct InviteTeamMemberView: View {
    let repository: LedgerRepository
    let onInvited: () -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var email = ""
    @State private var name = ""
    @State private var role: AssignableRole = .bookkeeper
    @State private var isSaving = false
    @State private var failure: String?

    private var canSave: Bool {
        let trimmed = email.trimmingCharacters(in: .whitespaces)
        return trimmed.contains("@") && trimmed.contains(".")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Correo", text: $email)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.emailAddress)
                    TextField("Nombre (opcional)", text: $name)
                    Picker("Rol", selection: $role) {
                        ForEach(AssignableRole.allCases) { option in
                            Text(option.label).tag(option)
                        }
                    }
                } footer: {
                    Text(role.roleDescription)
                        .foregroundStyle(OBColor.mutedForeground)
                }
                .listRowBackground(OBColor.card)

                if let failure {
                    Section {
                        Text(failure)
                            .font(.footnote)
                            .foregroundStyle(OBColor.neg)
                    }
                    .listRowBackground(OBColor.card)
                }
            }
            .scrollContentBackground(.hidden)
            .background(OBColor.background)
            .foregroundStyle(OBColor.foreground)
            .tint(OBColor.primary)
            .navigationTitle("Invitar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView().tint(OBColor.primary)
                    } else {
                        Button("Invitar", action: save).disabled(!canSave)
                    }
                }
            }
        }
    }

    private func save() {
        isSaving = true
        failure = nil
        Task {
            do {
                try await repository.inviteTeamMember(
                    email: email.trimmingCharacters(in: .whitespaces),
                    name: name.trimmingCharacters(in: .whitespaces).isEmpty
                        ? nil : name.trimmingCharacters(in: .whitespaces),
                    role: role
                )
                onInvited()
                dismiss()
            } catch {
                failure = (error as? LocalizedError)?.errorDescription ?? "No se pudo invitar a ese correo."
                isSaving = false
            }
        }
    }
}
