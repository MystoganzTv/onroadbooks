import SwiftUI

struct SettlementsView: View {
    let repository: LedgerRepository
    @State private var settlements: [SettlementPeriod] = []
    @State private var isLoading = true

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
                            SettlementRow(settlement: settlement)
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
            .task {
                settlements = (try? await repository.fetchSettlements()) ?? []
                isLoading = false
            }
        }
    }
}

private struct SettlementRow: View {
    let settlement: SettlementPeriod
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
                metric("Net Profit", settlement.netProfit, color: OBColor.pos)
                if settlement.status == .closed {
                    metric("To Reserves", settlement.reserveContributions)
                    metric("Owner Draw", settlement.ownerDraw, color: OBColor.primary)
                }
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
