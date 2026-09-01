import SwiftUI

struct LoadsView: View {
    let repository: LedgerRepository
    @State private var loads: [Load] = []
    @State private var isLoading = true

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                OBScreenHeader(title: "Loads", subtitle: isLoading ? nil : "\(loads.count) loads")

                if isLoading {
                    ProgressView().tint(OBColor.primary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List {
                        ForEach(loads) { load in
                            LoadDetailRow(load: load)
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
                loads = (try? await repository.fetchLoads()) ?? []
                isLoading = false
            }
        }
    }
}

private struct LoadDetailRow: View {
    let load: Load
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(load.lane)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(OBColor.foreground)
                Spacer()
                RatingChip(rating: load.rating)
            }
            Text(load.broker)
                .font(.caption)
                .foregroundStyle(OBColor.mutedForeground)
            HStack(spacing: OBSpacing.lg) {
                metric("Rate", load.rate.formatted(.currency(code: "USD").precision(.fractionLength(0))))
                metric("Miles", "\(Int(load.miles))")
                metric("Deadhead", "\(Int(load.deadheadMiles)) mi")
                metric("Profit/mi", load.profitPerMile.formatted(.currency(code: "USD").precision(.fractionLength(2))))
            }
        }
        .padding(.vertical, 6)
    }

    private func metric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(OBColor.mutedForeground)
            Text(value)
                .font(.caption.weight(.medium))
                .monospacedDigit()
                .foregroundStyle(OBColor.foreground)
        }
    }
}
