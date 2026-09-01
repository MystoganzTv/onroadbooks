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
            } else if let ledger {
                content(ledger)
            } else {
                ComingSoonView(title: "Reserves", systemImage: "building.columns.fill")
            }
        }
        .background(OBColor.background)
        .navigationTitle("Reserves")
        .navigationBarTitleDisplayMode(.inline)
        .task { await reload() }
        .refreshable { await reload() }
    }

    @ViewBuilder
    private func content(_ ledger: ReserveLedger) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: OBSpacing.lg) {

                VStack(alignment: .leading, spacing: 6) {
                    LabelXS("Guardado en total")
                    MoneyText(amount: ledger.total, font: .largeTitle.weight(.semibold))
                    Text(movementLine(ledger))
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
        do {
            ledger = try await repository.fetchReserves()
            failure = nil
            locked = false
        } catch {
            if case APIError.refused(let message) = error {
                failure = message
                locked = true
            } else {
                failure = (error as? LocalizedError)?.errorDescription
                    ?? "No se pudieron cargar las reservas."
                locked = false
            }
        }
        isLoading = false
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
                Text(bucket.balance, format: .currency(code: "USD").precision(.fractionLength(2)))
                    .font(.title3.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(OBColor.foreground)
            }

            if let target = bucket.targetBalance, let progress = bucket.targetProgress {
                VStack(alignment: .leading, spacing: 5) {
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(OBColor.surfaceRaised)
                            Capsule()
                                .fill(OBColor.primary)
                                .frame(width: max(4, geo.size.width * min(progress / 100, 1)))
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
