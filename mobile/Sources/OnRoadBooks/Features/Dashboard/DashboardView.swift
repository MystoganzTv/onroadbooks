import SwiftUI

/// THE COCKPIT — mirrors the web dashboard's reading order (see the header
/// comment on `src/app/(app)/dashboard/page.tsx`):
///   Am I making money?  → hero band
///   How did today go?   → today strip
///   What does a mile cost, and am I on track? → cost per mile / safe to pay
///   Where did the money go? → money flow
///   Which loads were worth it? → recent loads
///   Am I saving enough? → reserves
struct DashboardView: View {
    @StateObject private var viewModel: DashboardViewModel
    /// The account's first name, or nil. Never derived from an email address.
    private let greetingName: String?

    init(repository: LedgerRepository, greetingName: String? = nil) {
        _viewModel = StateObject(wrappedValue: DashboardViewModel(repository: repository))
        self.greetingName = greetingName
    }

    /// The cockpit is opened at 4am before a run and at 9pm after one, so the
    /// greeting follows the clock rather than assuming an office day.
    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        let time = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches"
        guard let greetingName, !greetingName.isEmpty else { return time }
        return "\(time), \(greetingName)"
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // "Dashboard" was dead weight: the tab bar underneath already
                // says it. The greeting earns the line instead.
                OBScreenHeader(title: greeting, subtitle: viewModel.snapshot?.periodLabel)

                ScrollView {
                    if let snapshot = viewModel.snapshot {
                        content(for: snapshot)
                    } else {
                        ProgressView().tint(OBColor.primary)
                            .frame(maxWidth: .infinity, minHeight: 300)
                    }
                }
                .refreshable { await viewModel.load() }
            }
            .background(OBColor.background)
            .toolbar(.hidden, for: .navigationBar)
            .task { await viewModel.load() }
        }
    }

    @ViewBuilder
    private func content(for s: DashboardSnapshot) -> some View {
        VStack(alignment: .leading, spacing: OBSpacing.lg) {

            // Hero band — am I making money?
            //
            // One voice, not three. Net Profit is the answer, so it keeps the
            // green value and the coloured badge; Revenue is the context for
            // it and its change speaks quietly. A fall still shouts, on either.
            HStack(spacing: OBSpacing.sm) {
                StatTile(label: "Revenue", value: s.revenue, delta: s.revenueDelta, quietDelta: true)
                StatTile(label: "Net Profit", value: s.netProfit, delta: s.netProfitDelta, valueColor: OBColor.pos)
            }
            .padding(.horizontal, OBSpacing.md)

            // Expenses is context too, so it sits at the same weight as the
            // rest instead of taking the widest card on the screen for a number
            // you cannot act on. Today rides beside it — the sun that used to
            // sit here decorated nothing, in a design where colour and shape
            // carry meaning.
            HStack(spacing: OBSpacing.sm) {
                StatTile(label: "Expenses", value: s.expenses)
                StatTile(
                    label: "Today",
                    value: s.todayRevenue,
                    footnote: s.todayLoads == 1 ? "1 load" : "\(s.todayLoads) loads"
                )
            }
            .padding(.horizontal, OBSpacing.md)

            // Business health — cost per mile / safe to pay
            HStack(spacing: OBSpacing.sm) {
                VStack(alignment: .leading, spacing: 6) {
                    LabelXS("True Cost / Mile")
                    Text(s.trueCostPerMile, format: .currency(code: "USD").precision(.fractionLength(2)))
                        .font(.title2.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(OBColor.foreground)
                    Text("\(Int(s.totalMiles)) mi · \(Int(s.deadheadPct * 100))% deadhead")
                        .font(.caption)
                        .foregroundStyle(OBColor.mutedForeground)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(OBSpacing.md)
                .obPanel()

                VStack(alignment: .leading, spacing: 6) {
                    LabelXS("Safe to Pay")
                    MoneyText(amount: s.safeToPay, color: OBColor.primary)
                    Text("after reserves")
                        .font(.caption)
                        .foregroundStyle(OBColor.mutedForeground)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(OBSpacing.md)
                .obPanel()
            }
            .padding(.horizontal, OBSpacing.md)

            // Money flow — where did it go
            VStack(alignment: .leading, spacing: 0) {
                PanelHeader(title: "Money Flow", trailing: "This month")
                VStack(spacing: OBSpacing.md) {
                    ForEach(s.expenseBreakdown) { row in
                        CategoryBarRow(
                            label: row.label,
                            amount: row.amount,
                            fraction: s.expenses > 0 ? row.amount / s.expenses : 0
                        )
                    }
                }
                .padding(OBSpacing.md)
            }
            .obPanel()
            .padding(.horizontal, OBSpacing.md)

            // Recent loads
            VStack(alignment: .leading, spacing: 0) {
                PanelHeader(title: "Recent Loads", trailing: "See all")
                VStack(spacing: 0) {
                    ForEach(Array(s.recentLoads.enumerated()), id: \.element.id) { index, load in
                        LoadRow(load: load)
                            .padding(.horizontal, OBSpacing.md)
                            .padding(.vertical, OBSpacing.sm)
                        if index < s.recentLoads.count - 1 {
                            Rectangle().fill(OBColor.border).frame(height: 1)
                                .padding(.leading, OBSpacing.md)
                        }
                    }
                }
            }
            .obPanel()
            .padding(.horizontal, OBSpacing.md)

            // Reserves — am I saving enough
            VStack(alignment: .leading, spacing: 0) {
                PanelHeader(title: "Reserves")
                HStack(spacing: OBSpacing.sm) {
                    ForEach(s.reserves) { reserve in
                        VStack(alignment: .leading, spacing: 4) {
                            LabelXS(reserve.name)
                            Text(reserve.balance, format: .currency(code: "USD").precision(.fractionLength(0)))
                                .font(.headline)
                                .monospacedDigit()
                                .foregroundStyle(OBColor.foreground)
                            Text(reserve.contributionLabel)
                                .font(.caption2)
                                .foregroundStyle(OBColor.mutedForeground)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(OBSpacing.md)
            }
            .obPanel()
            .padding(.horizontal, OBSpacing.md)
            .padding(.bottom, OBSpacing.xl)
        }
    }
}

struct LoadRow: View {
    let load: Load
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(load.lane)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(OBColor.foreground)
                Text(load.broker)
                    .font(.caption)
                    .foregroundStyle(OBColor.mutedForeground)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Text(load.rate, format: .currency(code: "USD").precision(.fractionLength(0)))
                    .font(.subheadline.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(OBColor.foreground)
                RatingChip(rating: load.rating)
            }
        }
    }
}
