import SwiftUI

/// Which lanes and which brokers are worth repeating.
///
/// The rule that makes this trustworthy is the one about restraint: a lane is
/// not ranked until it has enough loads to mean something (ADR-0014). Lanes
/// below that line are shown as "emerging" with how many more loads they need
/// — the honest version of "we do not know yet" — instead of being crowned or
/// condemned off one lucky run.
struct AnalyticsView: View {
    let repository: LedgerRepository

    @State private var snapshot: AnalyticsSnapshot?
    @State private var isLoading = true
    @State private var failure: String?
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
            } else if let snapshot {
                content(snapshot)
            }
        }
        .background(OBColor.background)
        .navigationTitle("Analytics")
        .navigationBarTitleDisplayMode(.inline)
        .task { await reload() }
        .refreshable { await reload() }
    }

    @ViewBuilder
    private func content(_ snapshot: AnalyticsSnapshot) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: OBSpacing.lg) {

                Text(snapshot.periodLabel)
                    .font(.footnote)
                    .foregroundStyle(OBColor.mutedForeground)
                    .padding(.horizontal, OBSpacing.md)

                if snapshot.qualifiedCount == 0 && snapshot.emerging.isEmpty {
                    Text("Todavía no hay loads suficientes en este período.")
                        .font(.subheadline)
                        .foregroundStyle(OBColor.mutedForeground)
                        .padding(.horizontal, OBSpacing.md)
                }

                lanePanel("Mejores rutas", snapshot.best)
                lanePanel("Peores rutas", snapshot.worst)

                if !snapshot.emerging.isEmpty {
                    VStack(alignment: .leading, spacing: 0) {
                        PanelHeader(title: "Sin ranquear todavía")
                        VStack(spacing: 0) {
                            ForEach(Array(snapshot.emerging.enumerated()), id: \.element.id) { index, lane in
                                HStack(alignment: .top) {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(lane.label)
                                            .font(.subheadline.weight(.medium))
                                            .foregroundStyle(OBColor.foreground)
                                        Text(lane.loadCount == 1 ? "1 load" : "\(lane.loadCount) loads")
                                            .font(.caption)
                                            .foregroundStyle(OBColor.mutedForeground)
                                    }
                                    Spacer(minLength: OBSpacing.sm)
                                    if let needed = lane.loadsNeeded, needed > 0 {
                                        Text(needed == 1 ? "falta 1" : "faltan \(needed)")
                                            .font(.caption.weight(.medium))
                                            .foregroundStyle(OBColor.mutedForeground)
                                    }
                                }
                                .padding(.horizontal, OBSpacing.md)
                                .padding(.vertical, OBSpacing.sm)
                                if index < snapshot.emerging.count - 1 { divider }
                            }
                        }
                        Text("Una ruta se ranquea con \(snapshot.minLoads) loads. Antes de eso, un solo viaje afortunado decidiría el ranking.")
                            .font(.caption)
                            .foregroundStyle(OBColor.mutedForeground)
                            .padding(.horizontal, OBSpacing.md)
                            .padding(.bottom, OBSpacing.md)
                    }
                    .obPanel()
                    .padding(.horizontal, OBSpacing.md)
                }

                if !snapshot.brokers.isEmpty {
                    VStack(alignment: .leading, spacing: 0) {
                        PanelHeader(title: "Brokers")
                        VStack(spacing: 0) {
                            ForEach(Array(snapshot.brokers.enumerated()), id: \.element.id) { index, broker in
                                HStack(alignment: .top) {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(broker.broker)
                                            .font(.subheadline.weight(.medium))
                                            .foregroundStyle(OBColor.foreground)
                                        Text(detail(loads: broker.loadCount, perMile: broker.profitPerMile, deadhead: broker.deadheadPct))
                                            .font(.caption)
                                            .foregroundStyle(OBColor.mutedForeground)
                                        if broker.outstanding > 0 {
                                            Text("\(broker.outstanding, format: .currency(code: "USD").precision(.fractionLength(0))) sin cobrar")
                                                .font(.caption2)
                                                .foregroundStyle(OBColor.mutedForeground)
                                        }
                                    }
                                    Spacer(minLength: OBSpacing.sm)
                                    RatingChip(rating: broker.rating)
                                }
                                .padding(.horizontal, OBSpacing.md)
                                .padding(.vertical, OBSpacing.sm)
                                if index < snapshot.brokers.count - 1 { divider }
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

    @ViewBuilder
    private func lanePanel(_ title: String, _ lanes: [LanePerformance]) -> some View {
        if !lanes.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                PanelHeader(title: title)
                VStack(spacing: 0) {
                    ForEach(Array(lanes.enumerated()), id: \.element.id) { index, lane in
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(lane.label)
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(OBColor.foreground)
                                Text(detail(loads: lane.loadCount, perMile: lane.profitPerMile, deadhead: lane.deadheadPct))
                                    .font(.caption)
                                    .foregroundStyle(OBColor.mutedForeground)
                            }
                            Spacer(minLength: OBSpacing.sm)
                            RatingChip(rating: lane.rating)
                        }
                        .padding(.horizontal, OBSpacing.md)
                        .padding(.vertical, OBSpacing.sm)
                        if index < lanes.count - 1 { divider }
                    }
                }
            }
            .obPanel()
            .padding(.horizontal, OBSpacing.md)
        }
    }

    private var divider: some View {
        Rectangle().fill(OBColor.border).frame(height: 1).padding(.leading, OBSpacing.md)
    }

    private func detail(loads: Int, perMile: Double, deadhead: Double) -> String {
        let count = loads == 1 ? "1 load" : "\(loads) loads"
        let rate = perMile.formatted(.currency(code: "USD").precision(.fractionLength(2)))
        return "\(count) · \(rate)/mi · \(Int(deadhead.rounded()))% vacías"
    }

    private func reload() async {
        do {
            snapshot = try await repository.fetchAnalytics()
            failure = nil
            locked = false
        } catch {
            if case APIError.refused(let message) = error {
                failure = message
                locked = true
            } else {
                failure = (error as? LocalizedError)?.errorDescription ?? "No se pudo cargar."
                locked = false
            }
        }
        isLoading = false
    }
}
