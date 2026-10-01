import SwiftUI

struct LoadsView: View {
    let repository: LedgerRepository
    @State private var loads: [Load] = []
    @State private var isLoading = true
    @State private var isAdding = false
    /// Why the last refresh failed. The list on screen stays: a dropped
    /// request is not an empty ledger.
    @State private var refreshFailure: String?

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
                OBPeriodBar()
                NavigationLink("Todos los campos y asignaciones") {
                    ManagementView(repository: repository, resource: "loads", title: "Cargas")
                }
                .font(.subheadline)
                .padding(.vertical, 8)

                if isLoading {
                    ProgressView().tint(OBColor.primary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if loads.isEmpty, refreshFailure != nil {
                    // Still a List so pull-to-retry works on this screen too.
                    List {
                        OBUnavailableView(title: "Loads")
                            .frame(minHeight: 300)
                            .listRowBackground(OBColor.background)
                            .listRowSeparator(.hidden)
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                } else {
                    List {
                        if let refreshFailure {
                            OBRefreshFailureBanner(message: refreshFailure)
                                .listRowBackground(OBColor.background)
                                .listRowSeparator(.hidden)
                        }
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
            .obReloadsOnScope { await reload() }
            .obRefreshable { await reload() }
            .sheet(isPresented: $isAdding) {
                AddLoadView(repository: repository, onSaved: { Task { await reload() } })
            }
        }
    }

    private func reload() async {
        do {
            loads = try await repository.fetchLoads()
            refreshFailure = nil
        } catch let error where error.isCancellation {
            // Abandoned by the app, not refused by anyone. Keep everything.
        } catch {
            refreshFailure = (error as? LocalizedError)?.errorDescription
                ?? "No se pudo actualizar. Revisa la señal y desliza para reintentar."
        }
        isLoading = false
    }
}

private struct LoadDetailRow: View {
    let load: Load
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                // The PO leads: the lane repeats, the PO never does.
                VStack(alignment: .leading, spacing: 2) {
                    if let po = load.poLabel {
                        Text(po)
                            .font(.subheadline.weight(.bold))
                            .monospacedDigit()
                            .foregroundStyle(OBColor.foreground)
                        Text(load.lane)
                            .font(.caption)
                            .foregroundStyle(OBColor.foreground)
                    } else {
                        Text(load.lane)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(OBColor.foreground)
                    }
                }
                Spacer()
                RatingChip(rating: load.rating)
            }
            HStack(spacing: 6) {
                Text(load.broker)
                Text("·")
                Text(load.date, format: .dateTime.month(.abbreviated).day())
                Text("·")
                Text("\(Int(load.deadheadMiles)) mi vacías")
            }
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
            // The server sends the basis it actually allocated on. Printing a
            // sentence of our own here was the phone telling the owner where a
            // number came from without asking the thing that produced it.
            Text(load.allocationBasisLabel)
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
