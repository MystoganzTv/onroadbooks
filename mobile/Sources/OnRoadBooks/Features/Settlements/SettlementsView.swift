import SwiftUI

struct SettlementsView: View {
    let repository: LedgerRepository
    @State private var settlements: [SettlementPeriod] = []
    @State private var isLoading = true
    @State private var pendingClose: SettlementPeriod?
    @State private var pendingReopen: SettlementPeriod?
    @State private var working = false
    @State private var failure: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                OBScreenHeader(title: "Owner Settlements",
                               subtitle: isLoading ? nil : "\(settlements.count) periods")

                if isLoading {
                    ProgressView().tint(OBColor.primary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List {
                        ForEach(settlements) { settlement in
                            SettlementRow(
                                settlement: settlement,
                                working: working,
                                onClose: { pendingClose = settlement },
                                onReopen: { pendingReopen = settlement }
                            )
                            .listRowBackground(OBColor.card)
                            .listRowSeparatorTint(OBColor.border)
                        }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            }
            .background(OBColor.background)
            .toolbar(.hidden, for: .navigationBar)
            .task { await reload() }
            .refreshable { await reload() }
            .confirmationDialog(
                pendingClose.map { "¿Cerrar \($0.label)?" } ?? "¿Cerrar la quincena?",
                isPresented: Binding(
                    get: { pendingClose != nil },
                    set: { if !$0 { pendingClose = nil } }
                ),
                titleVisibility: .visible
            ) {
                Button("Cerrar quincena") {
                    guard let period = pendingClose else { return }
                    pendingClose = nil
                    apply(period, closed: true)
                }
                Button("Cancelar", role: .cancel) { pendingClose = nil }
            } message: {
                Text("Congela las cifras de este período y aparta a tus reservas lo que corresponde. Se puede reabrir, y reabrir deshace exactamente esos apartados.")
            }
            .confirmationDialog(
                pendingReopen.map { "¿Reabrir \($0.label)?" } ?? "¿Reabrir la quincena?",
                isPresented: Binding(
                    get: { pendingReopen != nil },
                    set: { if !$0 { pendingReopen = nil } }
                ),
                titleVisibility: .visible
            ) {
                Button("Reabrir", role: .destructive) {
                    guard let period = pendingReopen else { return }
                    pendingReopen = nil
                    apply(period, closed: false)
                }
                Button("Cancelar", role: .cancel) { pendingReopen = nil }
            } message: {
                Text("Las cifras vuelven a calcularse en vivo y se revierten los apartados que hizo este cierre. Los movimientos que hiciste a mano no se tocan.")
            }
            .alert(
                "No se pudo",
                isPresented: Binding(
                    get: { failure != nil },
                    set: { if !$0 { failure = nil } }
                )
            ) {
                Button("Entendido", role: .cancel) { failure = nil }
            } message: {
                Text(failure ?? "")
            }
        }
    }

    private func reload() async {
        settlements = (try? await repository.fetchSettlements()) ?? []
        isLoading = false
    }

    private func apply(_ period: SettlementPeriod, closed: Bool) {
        guard let month = period.month, let half = period.half else {
            failure = "Esta quincena no se puede cambiar desde el teléfono."
            return
        }
        working = true
        Task {
            do {
                try await repository.setSettlementStatus(month: month, half: half, closed: closed)
                await reload()
            } catch {
                failure = (error as? LocalizedError)?.errorDescription
                    ?? "No se pudo actualizar la quincena."
            }
            working = false
        }
    }
}

private struct SettlementRow: View {
    let settlement: SettlementPeriod
    let working: Bool
    let onClose: () -> Void
    let onReopen: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(settlement.label)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(OBColor.foreground)
                Spacer()
                StatusPill(text: settlement.status.rawValue, isActive: settlement.status == .open)
            }
            // These used to be hidden until the window was closed, directly
            // above the button that closes it -- asking someone to settle a
            // fortnight without telling them what they earned, what they
            // collected, or what they could safely take. The web shows all of
            // it open or closed; the status pill is what says which it is.
            HStack(spacing: OBSpacing.lg) {
                metric("Operating Profit", settlement.operatingProfit, color: OBColor.pos)
                metric("To Reserves", settlement.reserveContributions)
                metric("Safe to Pay", settlement.ownerDraw, color: OBColor.primary)
            }
            HStack(spacing: OBSpacing.lg) {
                optionalMetric("Cobrado", settlement.collectedRevenue)
                optionalMetric("Aún pendiente", settlement.accountsReceivable, color: OBColor.warn)
            }

            if settlement.drifted {
                // `drifted` arrived in this DTO from the first version and was
                // decoded straight into the bin. A close that drifted is money
                // frozen at a number the books no longer agree with.
                VStack(alignment: .leading, spacing: 2) {
                    Text("Los libros cambiaron después de liquidar esta quincena")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(OBColor.warn)
                    Text("Reábrela para revisar las cifras actualizadas y vuelve a liquidarla si son correctas.")
                        .font(.caption2)
                        .foregroundStyle(OBColor.mutedForeground)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(OBSpacing.sm)
                .background(OBColor.warnSoft, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }

            financialDetails

            if settlement.status == .open {
                if settlement.closable {
                    Button(action: onClose) {
                        Text("Cerrar quincena")
                            .font(.caption.weight(.semibold))
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(OBColor.primary)
                    .disabled(working)
                } else {
                    // A window still running cannot be closed, and saying so
                    // beats a button that only refuses when pressed.
                    Text("Se puede cerrar cuando termine el período.")
                        .font(.caption2)
                        .foregroundStyle(OBColor.mutedForeground)
                }
            } else {
                Button(action: onReopen) {
                    Text("Reabrir")
                        .font(.caption.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
                .tint(OBColor.mutedForeground)
                .disabled(working)
            }
        }
        .padding(.vertical, 6)
    }

    /// The web's "Detalles financieros", same rows in the same order. A null
    /// prints as "—" exactly as `DetailRow` does: those periods were frozen
    /// under an older financial model and the figure genuinely is not known.
    private var financialDetails: some View {
        DisclosureGroup {
            VStack(spacing: 0) {
                detailRow("Ingreso facturado", settlement.bookedRevenue)
                detailRow("Ingreso cobrado", settlement.collectedRevenue)
                detailRow("Por cobrar", settlement.accountsReceivable)
                detailRow("Utilidad operativa", settlement.operatingProfit, strong: true)
                detailRow("Intereses", settlement.interestExpense)
                detailRow("Capital", settlement.principalPayment)
                detailRow("Deuda sin asignar", settlement.unallocatedDebtService)
                detailRow("Servicio de deuda", settlement.debtService, negative: true)
                detailRow("Efectivo después de deuda", settlement.cashAfterDebtService, strong: true)
            }
        } label: {
            Text("Detalles financieros")
                .font(.caption)
                .foregroundStyle(OBColor.mutedForeground)
        }
        .tint(OBColor.mutedForeground)
    }

    private func detailRow(
        _ label: String,
        _ amount: Double?,
        negative: Bool = false,
        strong: Bool = false
    ) -> some View {
        HStack {
            Text(label)
                .font(.caption)
                .foregroundStyle(strong ? OBColor.foreground : OBColor.mutedForeground)
            Spacer(minLength: OBSpacing.sm)
            if let amount {
                Text(
                    negative && amount > 0 ? -amount : amount,
                    format: .currency(code: "USD").precision(.fractionLength(2))
                )
                .font(strong ? .subheadline.weight(.semibold) : .subheadline)
                .monospacedDigit()
                .foregroundStyle(negative ? OBColor.neg : OBColor.foreground)
            } else {
                Text("—")
                    .font(.subheadline)
                    .foregroundStyle(OBColor.mutedForeground)
            }
        }
        .padding(.vertical, 5)
    }

    private func optionalMetric(
        _ label: String,
        _ value: Double?,
        color: Color = OBColor.foreground
    ) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(OBColor.mutedForeground)
            if let value {
                Text(value, format: .currency(code: "USD").precision(.fractionLength(0)))
                    .font(.caption.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(color)
            } else {
                Text("—")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(OBColor.mutedForeground)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func metric(_ label: String, _ value: Double, color: Color = OBColor.foreground) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(OBColor.mutedForeground)
            Text(value, format: .currency(code: "USD").precision(.fractionLength(0)))
                .font(.caption.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
