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
            HStack(spacing: OBSpacing.lg) {
                metric("Operating Profit", settlement.operatingProfit, color: OBColor.pos)
                if settlement.status == .closed {
                    metric("To Reserves", settlement.reserveContributions)
                    metric("Owner Draw", settlement.ownerDraw, color: OBColor.primary)
                }
            }

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
    }
}
