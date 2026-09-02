import SwiftUI

struct LoadsView: View {
    let repository: LedgerRepository
    @State private var loads: [Load] = []
    @State private var isLoading = true
    @State private var isAdding = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                OBScreenHeader(
                    title: "Loads",
                    subtitle: isLoading ? nil : "\(loads.count) loads",
                    actionIcon: "plus",
                    actionLabel: "Nuevo load",
                    action: { isAdding = true }
                )

                if isLoading {
                    ProgressView().tint(OBColor.primary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List {
                        ForEach(loads) { load in
                            NavigationLink {
                                LoadDetailView(
                                    repository: repository,
                                    loadId: load.id,
                                    onChanged: { Task { await reload() } }
                                )
                            } label: {
                                LoadDetailRow(load: load)
                            }
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
            .sheet(isPresented: $isAdding) {
                AddLoadView(repository: repository, onSaved: { Task { await reload() } })
            }
        }
    }

    private func reload() async {
        loads = (try? await repository.fetchLoads()) ?? []
        isLoading = false
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
                metric("Contribution", load.contributionProfit.formatted(.currency(code: "USD").precision(.fractionLength(0))))
                metric("Contribution/mi", load.contributionProfitPerMile.formatted(.currency(code: "USD").precision(.fractionLength(2))))
            }
            HStack(spacing: OBSpacing.lg) {
                metric("Direct costs", load.directTripCosts.formatted(.currency(code: "USD").precision(.fractionLength(0))))
                metric("Est. operating", load.estimatedFullyLoadedOperatingProfit.formatted(.currency(code: "USD").precision(.fractionLength(0))))
                metric("Debt burden", load.debtCashBurden.formatted(.currency(code: "USD").precision(.fractionLength(0))))
            }
            Text("Allocated operating costs and debt are separate; rating uses Contribution only.")
                .font(.system(size: 9))
                .foregroundStyle(OBColor.mutedForeground)
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
