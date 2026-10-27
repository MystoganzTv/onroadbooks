import SwiftUI

/// Am I saving enough?
///
/// The one screen where a progress bar means what it looks like: a reserve with
/// a target really is filling toward it. A bucket with no target gets no bar at
/// all rather than an empty one implying a goal nobody set.
struct ReservesView: View {
    let repository: LedgerRepository

    @State private var ledger: ReserveLedger?
    @State private var isLoading = true
    @State private var failure: String?
    /// True only when the server refused on purpose (the cockpit plan gate),
    /// which reads very differently from a dropped connection.
    @State private var locked = false
    @State private var isMoving = false
    @State private var latestRequest = UUID()

    var body: some View {
        Group {
            if let ledger, !locked {
                content(ledger)
            } else if isLoading {
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
                    Button("Reintentar") { Task { await reload() } }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                OBUnavailableView(title: "Reservas")
            }
        }
        .background(OBColor.background)
        .navigationTitle("Reserves")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                NavigationLink {
                    ManagementView(repository: repository, resource: "reserve-buckets", title: "Cubetas")
                } label: { Label("Cubetas", systemImage: "slider.horizontal.3") }
            }
        }
        .toolbar {
            if let ledger, !ledger.accounts.isEmpty, !locked {
                ToolbarItem(placement: .primaryAction) {
                    Button { isMoving = true } label: { Image(systemName: "plus.forwardslash.minus") }
                }
            }
        }
        .sheet(isPresented: $isMoving) {
            ReserveMovementView(
                repository: repository,
                buckets: ledger?.accounts ?? [],
                onSaved: { Task { await reload() } }
            )
        }
        .obScopeBar()
        .obReloadsOnScope { await reload() }
    }

    @ViewBuilder
    private func content(_ ledger: ReserveLedger) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: OBSpacing.lg) {
                if let failure {
                    OBRefreshFailureBanner(message: failure)
                        .padding(.horizontal, OBSpacing.md)
                }

                VStack(alignment: .leading, spacing: 6) {
                    LabelXS("A apartar este período")
                    if let suggested = ledger.suggestedTotal {
                        MoneyText(amount: suggested, font: .largeTitle.weight(.semibold))
                            .accessibilityIdentifier("reserve-suggested-total")
                    } else {
                        Text("Cálculo no disponible. Vuelve a cargar.")
                            .foregroundStyle(OBColor.mutedForeground)
                    }
                    Text("\(ledger.periodLabel) · Todo el negocio")
                        .font(.caption)
                        .foregroundStyle(OBColor.mutedForeground)
                    Text("Calculado según tus porcentajes. El saldo registrado cambia al agregar movimientos.")
                        .font(.caption)
                        .foregroundStyle(OBColor.mutedForeground)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(OBSpacing.md)
                .obPanel()
                .padding(.horizontal, OBSpacing.md)

                VStack(alignment: .leading, spacing: 6) {
                    LabelXS("Saldo registrado en reservas")
                    MoneyText(amount: ledger.total, font: .title2.weight(.semibold))
                        .accessibilityIdentifier("reserve-recorded-total")
                    Text(movementLine(ledger))
                        .font(.caption)
                        .foregroundStyle(OBColor.mutedForeground)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(OBSpacing.md)
                .obPanel()
                .padding(.horizontal, OBSpacing.md)

                // `safeToPay` has been in this screen's JSON and in
                // `ReserveLedger` from the start, and nothing rendered it --
                // on the one screen whose whole job is answering how much of
                // this is actually yours to take.
                VStack(alignment: .leading, spacing: 6) {
                    LabelXS("Disponible para ti")
                    MoneyText(amount: ledger.safeToPay, font: .title2.weight(.semibold), color: OBColor.primary)
                    Text("Estimado después de descontar las reservas calculadas.")
                        .font(.caption)
                        .foregroundStyle(OBColor.mutedForeground)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(OBSpacing.md)
                .obPanel()
                .padding(.horizontal, OBSpacing.md)

                VStack(spacing: OBSpacing.sm) {
                    ForEach(ledger.accounts) { bucket in
                        BucketCard(bucket: bucket)
                    }
                }
                .padding(.horizontal, OBSpacing.md)

                if !ledger.movements.isEmpty {
                    VStack(alignment: .leading, spacing: 0) {
                        PanelHeader(title: "Movimientos")
                        VStack(spacing: 0) {
                            ForEach(Array(ledger.movements.enumerated()), id: \.element.id) { index, movement in
                                MovementRow(movement: movement)
                                    .padding(.horizontal, OBSpacing.md)
                                    .padding(.vertical, OBSpacing.sm)
                                if index < ledger.movements.count - 1 {
                                    Rectangle().fill(OBColor.border).frame(height: 1)
                                        .padding(.leading, OBSpacing.md)
                                }
                            }
                        }
                    }
                    .obPanel()
                    .padding(.horizontal, OBSpacing.md)
                }

                Spacer(minLength: OBSpacing.xl)
            }
            .padding(.top, OBSpacing.sm)
        }
        .accessibilityIdentifier("reserves-scroll")
        .obRefreshable { await reload() }
    }

    private func movementLine(_ ledger: ReserveLedger) -> String {
        let inLabel = ledger.periodContributions
            .formatted(.currency(code: "USD").precision(.fractionLength(0)))
        if ledger.periodWithdrawals > 0 {
            let outLabel = ledger.periodWithdrawals
                .formatted(.currency(code: "USD").precision(.fractionLength(0)))
            return "\(inLabel) entraron · \(outLabel) salieron · \(ledger.periodLabel)"
        }
        return "\(inLabel) entraron este período · \(ledger.periodLabel)"
    }

    private func reload() async {
        let request = UUID()
        latestRequest = request
        defer { if latestRequest == request { isLoading = false } }
        do {
            let updated = try await repository.fetchReserves()
            guard latestRequest == request else { return }
            ledger = updated
            failure = nil
            locked = false
        } catch let error where error.isCancellation {
            // Keep the last ledger when SwiftUI replaces a task.
        } catch {
            guard latestRequest == request else { return }
            if case APIError.refused(let message) = error {
                failure = message
                locked = true
            } else {
                failure = (error as? LocalizedError)?.errorDescription
                    ?? "No se pudieron cargar las reservas."
                locked = false
            }
        }
    }
}

private struct BucketCard: View {
    let bucket: ReserveBucket

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(bucket.name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(OBColor.foreground)
                    if let rule = bucket.ruleLabel {
                        Text(rule)
                            .font(.caption)
                            .foregroundStyle(OBColor.mutedForeground)
                    }
                }
                Spacer(minLength: OBSpacing.sm)
                VStack(alignment: .trailing, spacing: 4) {
                    LabelXS("A apartar")
                    if let suggested = bucket.suggestedContribution {
                        Text(suggested, format: .currency(code: "USD").precision(.fractionLength(2)))
                            .font(.title3.weight(.semibold))
                            .monospacedDigit()
                            .foregroundStyle(OBColor.foreground)
                            .accessibilityIdentifier("reserve-suggested-\(bucket.id)")
                    } else {
                        Text("—").foregroundStyle(OBColor.mutedForeground)
                    }
                }
            }

            Text("Saldo registrado: \(bucket.balance, format: .currency(code: "USD").precision(.fractionLength(2)))")
                .font(.caption)
                .foregroundStyle(OBColor.mutedForeground)

            if let target = bucket.targetBalance, let progress = bucket.targetProgress {
                VStack(alignment: .leading, spacing: 5) {
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(OBColor.surfaceRaised)
                            Capsule()
                                .fill(OBColor.primary)
                                .frame(width: geo.size.width * max(0, min(progress / 100, 1)))
                        }
                    }
                    .frame(height: 6)
                    Text("\(Int(progress.rounded()))% de \(target, format: .currency(code: "USD").precision(.fractionLength(0)))")
                        .font(.caption2)
                        .foregroundStyle(OBColor.mutedForeground)
                }
            } else {
                Text("Sin meta")
                    .font(.caption2)
                    .foregroundStyle(OBColor.mutedForeground)
            }

            if bucket.periodContributions > 0 || bucket.periodWithdrawals > 0 {
                Text(periodLine)
                    .font(.caption2)
                    .foregroundStyle(OBColor.mutedForeground)
            }

            if !bucket.maintenanceByTruck.isEmpty {
                Divider().overlay(OBColor.border)
                LabelXS("Mantenimiento por camión")
                ForEach(bucket.maintenanceByTruck) { truck in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(truck.truckName).font(.caption.weight(.semibold))
                            Text("\(truck.bookedRevenue, format: .currency(code: "USD")) de ingresos")
                                .font(.caption2)
                                .foregroundStyle(OBColor.mutedForeground)
                        }
                        Spacer()
                        Text(truck.suggestedReserve, format: .currency(code: "USD"))
                            .font(.caption.weight(.semibold))
                            .monospacedDigit()
                    }
                    .foregroundStyle(OBColor.foreground)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(OBSpacing.md)
        .obPanel()
    }

    private var periodLine: String {
        var parts: [String] = []
        if bucket.periodContributions > 0 {
            parts.append("+\(bucket.periodContributions.formatted(.currency(code: "USD").precision(.fractionLength(0)))) este período")
        }
        if bucket.periodWithdrawals > 0 {
            parts.append("−\(bucket.periodWithdrawals.formatted(.currency(code: "USD").precision(.fractionLength(0)))) retirado")
        }
        return parts.joined(separator: " · ")
    }
}

private struct MovementRow: View {
    let movement: ReserveMovement

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 3) {
                Text(movement.detail)
                    .font(.subheadline)
                    .foregroundStyle(OBColor.foreground)
                Text(movement.automatic
                     ? "\(movement.accountName) · automático"
                     : movement.accountName)
                    .font(.caption)
                    .foregroundStyle(OBColor.mutedForeground)
            }
            Spacer(minLength: OBSpacing.sm)
            Text(movement.amount, format: .currency(code: "USD").precision(.fractionLength(2)))
                .font(.subheadline.weight(.medium))
                .monospacedDigit()
                .foregroundStyle(movement.amount < 0 ? OBColor.mutedForeground : OBColor.foreground)
        }
    }
}
