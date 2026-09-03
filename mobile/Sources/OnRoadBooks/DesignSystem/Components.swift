import SwiftUI

// MARK: - Panel (mirrors the web app's `.panel` / `.panel-head` / `.panel-title`)

struct PanelModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(OBColor.card)
            .clipShape(RoundedRectangle(cornerRadius: OBRadius.card, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: OBRadius.card, style: .continuous)
                    .stroke(OBColor.border, lineWidth: 1)
            )
    }
}

extension View {
    /// Card container matching the web app's `.panel` style: bordered
    /// surface, rounded corners, no shadow (the web app doesn't use one).
    func obPanel() -> some View { modifier(PanelModifier()) }
}

struct PanelHeader: View {
    let title: String
    var trailing: String?

    var body: some View {
        HStack {
            Text(title)
                .font(.system(.headline, design: .rounded))
                .fontWeight(.semibold)
                .foregroundStyle(OBColor.foreground)
            Spacer()
            if let trailing {
                Text(trailing)
                    .font(.subheadline)
                    .foregroundStyle(OBColor.mutedForeground)
            }
        }
        .padding(.horizontal, OBSpacing.md)
        .padding(.vertical, OBSpacing.sm + 2)
        .overlay(alignment: .bottom) {
            Rectangle().fill(OBColor.border).frame(height: 1)
        }
    }
}

/// `.label-xs`: small, uppercase, muted — used above every figure.
struct LabelXS: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .semibold))
            .tracking(0.4)
            .foregroundStyle(OBColor.mutedForeground)
    }
}

// MARK: - Money

/// Renders a dollar amount with tabular (monospaced) digits, mirroring the
/// web app's `.tnum` rule: "financial UI numbers must align in columns."
struct MoneyText: View {
    let amount: Double
    var font: Font = .title2.weight(.semibold)
    var color: Color = OBColor.foreground

    var body: some View {
        Text(amount, format: .currency(code: "USD").precision(.fractionLength(2)))
            .font(font)
            .monospacedDigit()
            .foregroundStyle(color)
    }
}

// MARK: - Performance delta (green/red discipline)

enum PerformanceDirection { case up, down, neutral }

struct DeltaPill: View {
    let text: String
    let direction: PerformanceDirection
    /// Renders as plain muted text instead of a coloured pill.
    ///
    /// Colour is a voice, and three of them shouting at once is silence. On the
    /// hero band Operating Profit is the answer to "am I making money"; Booked Revenue is the
    /// context for it, so its change speaks quietly. A NEGATIVE change is never
    /// quiet, whichever metric it belongs to — that is news.
    var quiet = false

    private var color: Color {
        switch direction {
        case .up: return OBColor.pos
        case .down: return OBColor.neg
        case .neutral: return OBColor.mutedForeground
        }
    }
    private var soft: Color {
        switch direction {
        case .up: return OBColor.posSoft
        case .down: return OBColor.negSoft
        case .neutral: return OBColor.surfaceRaised
        }
    }
    private var symbol: String {
        switch direction {
        case .up: return "arrow.up.right"
        case .down: return "arrow.down.right"
        case .neutral: return "minus"
        }
    }

    private var isQuiet: Bool { quiet && direction != .down }

    var body: some View {
        Label(text, systemImage: symbol)
            .font(.system(size: 12, weight: isQuiet ? .medium : .semibold))
            .labelStyle(.titleAndIcon)
            .foregroundStyle(isQuiet ? OBColor.mutedForeground : color)
            .padding(.horizontal, isQuiet ? 0 : 8)
            .padding(.vertical, 3)
            .background(isQuiet ? Color.clear : soft, in: Capsule())
    }
}

// MARK: - Stat tile (hero metrics row)

struct StatTile: View {
    let label: String
    let value: Double
    var delta: (text: String, direction: PerformanceDirection)?
    var valueColor: Color = OBColor.foreground
    /// A supporting metric: its change reads as text, not as a badge.
    var quietDelta = false
    /// One line under the value — miles, a count, whatever makes the number
    /// mean something.
    var footnote: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            LabelXS(label)
            MoneyText(amount: value, color: valueColor)
            if let delta {
                DeltaPill(text: delta.text, direction: delta.direction, quiet: quietDelta)
            }
            if let footnote {
                Text(footnote)
                    .font(.caption)
                    .foregroundStyle(OBColor.mutedForeground)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(OBSpacing.md)
        .obPanel()
    }
}

// MARK: - Load rating (the one place a colour badge per row is the point —
// same as the web app's full broker/load scorecards, per project memory:
// summary panels stay neutral, detail lists carry the judgement.)

enum LoadRating: String, CaseIterable {
    // Matches the web app's ProfitabilityRating exactly (src/lib/types.ts)
    // so a value straight off /api/mobile/* never needs translating.
    case great = "GREAT", good = "GOOD", marginal = "MARGINAL", bad = "BAD"

    var color: Color {
        switch self {
        case .great: return OBColor.pos
        case .good: return OBColor.info
        case .marginal: return OBColor.warn
        case .bad: return OBColor.neg
        }
    }
    var soft: Color {
        switch self {
        case .great: return OBColor.posSoft
        case .good: return OBColor.infoSoft
        case .marginal: return OBColor.warnSoft
        case .bad: return OBColor.negSoft
        }
    }
}

struct RatingChip: View {
    let rating: LoadRating
    var body: some View {
        Text(rating.rawValue)
            .font(.system(size: 11, weight: .bold))
            .tracking(0.3)
            .foregroundStyle(rating.color)
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(rating.soft, in: Capsule())
    }
}

// MARK: - Neutral composition bar (money flow / category split — NOT a
// performance signal, so it never borrows pos/neg colours).

struct CategoryBarRow: View {
    let label: String
    let amount: Double
    let fraction: Double // 0...1 of the total

    /// A rounded, filled track reads as progress toward a target, and there is
    /// no target here — this is how one month's spending divides up. The share
    /// is stated in words next to the amount, and the mark is a square-ended
    /// segment on a hairline rule rather than a bar that fills.
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .firstTextBaseline) {
                Text(label).font(.subheadline).foregroundStyle(OBColor.foreground)
                Spacer(minLength: OBSpacing.sm)
                Text("\(Int((fraction * 100).rounded()))%")
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundStyle(OBColor.mutedForeground)
                Text(amount, format: .currency(code: "USD").precision(.fractionLength(0)))
                    .font(.subheadline.weight(.medium))
                    .monospacedDigit()
                    .foregroundStyle(OBColor.foreground)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Rectangle().fill(OBColor.border).frame(height: 1)
                        .frame(maxHeight: .infinity, alignment: .center)
                    Rectangle()
                        .fill(OBColor.info.opacity(0.7))
                        .frame(width: max(3, geo.size.width * fraction), height: 3)
                }
            }
            .frame(height: 3)
        }
    }
}

// MARK: - Status pill (settlement OPEN/CLOSED — a state, not a performance
// signal, so it stays informational blue / neutral, never green or red).

struct StatusPill: View {
    let text: String
    let isActive: Bool
    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 11, weight: .bold))
            .tracking(0.3)
            .foregroundStyle(isActive ? OBColor.info : OBColor.mutedForeground)
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(isActive ? OBColor.infoSoft : OBColor.surfaceRaised, in: Capsule())
    }
}

// MARK: - Screen header
//
// Tab roots use this INSTEAD of the system large title. On a phone the tab
// bar already names the screen, so `.navigationTitle` bought us nothing and
// cost ~96pt of empty chrome above the fold -- the first thing Enrique saw
// on the dashboard was a black band, not a number. Pushed screens keep the
// system bar (they need the back button) but run `.inline`.

struct OBScreenHeader: View {
    let title: String
    var subtitle: String? = nil
    /// One optional action, on the right. A screen that lets you add something
    /// puts it here rather than in a floating button, so the thing you press
    /// most on a phone is where the thumb already is.
    var actionIcon: String? = nil
    var actionLabel: String = "Añadir"
    var action: (() -> Void)? = nil

    var body: some View {
        HStack(alignment: .center, spacing: OBSpacing.sm) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(OBColor.foreground)
                if let subtitle {
                    Text(subtitle)
                        .font(.footnote)
                        .foregroundStyle(OBColor.mutedForeground)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if let actionIcon, let action {
                Button(action: action) {
                    Image(systemName: actionIcon)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(OBColor.primary)
                        .frame(width: 38, height: 38)
                        .background(OBColor.surfaceRaised, in: Circle())
                }
                .accessibilityLabel(Text(actionLabel))
            }
        }
        .padding(.horizontal, OBSpacing.md)
        .padding(.top, OBSpacing.xs)
        .padding(.bottom, OBSpacing.sm)
        .background(OBColor.background)
    }
}

// MARK: - Number entry

enum OBNumber {
    /// Parses what a thumb actually types at a fuel island: "412.60", "412,60",
    /// "1,240.75". When both separators appear the last one is the decimal
    /// mark, which is true in every locale that uses them.
    static func parse(_ text: String) -> Double? {
        var value = text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "$", with: "")
        if value.isEmpty { return nil }
        let comma = value.lastIndex(of: ",")
        let dot = value.lastIndex(of: ".")
        if let comma, dot == nil || comma > dot! {
            value = value.replacingOccurrences(of: ".", with: "")
            value = value.replacingOccurrences(of: ",", with: ".")
        } else {
            value = value.replacingOccurrences(of: ",", with: "")
        }
        return Double(value)
    }
}

/// A labelled numeric row for the entry forms: label on the left, the number
/// right-aligned and monospaced so a column of them reads like a receipt.
struct OBNumberRow: View {
    let label: String
    var prefix: String? = nil
    /// A trailing unit -- "mi", "$/gal", "%". Optional so the eleven existing
    /// call sites are untouched.
    var suffix: String? = nil
    var placeholder: String = "0"
    @Binding var text: String

    var body: some View {
        HStack {
            Text(label).foregroundStyle(OBColor.foreground)
            Spacer(minLength: OBSpacing.sm)
            if let prefix {
                Text(prefix).foregroundStyle(OBColor.mutedForeground)
            }
            TextField(placeholder, text: $text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .monospacedDigit()
                .foregroundStyle(OBColor.foreground)
                .frame(maxWidth: 140)
            // Reserve the suffix's width even when there is none, so the
            // value column lines up whether or not a given row has a unit --
            // "Oferta del broker" (no suffix) next to "Fuel price" (has one)
            // was landing on two different right edges otherwise.
            Text(suffix ?? "")
                .font(.caption)
                .foregroundStyle(OBColor.mutedForeground)
                .frame(width: 42, alignment: .leading)
        }
        // A row this thin is a miss with a gloved thumb.
        .frame(minHeight: 44)
    }
}

// MARK: - Empty / coming soon

/// The screen exists and could not load — which is a different sentence from
/// "coming soon", and saying the wrong one trains people to distrust the app.
struct OBUnavailableView: View {
    let title: String
    var message: String = "No se pudo cargar. Revisa la señal y desliza para reintentar."
    var systemImage: String = "wifi.exclamationmark"

    var body: some View {
        VStack(spacing: OBSpacing.sm) {
            Image(systemName: systemImage)
                .font(.system(size: 34))
                .foregroundStyle(OBColor.mutedForeground)
            Text(title)
                .font(.headline)
                .foregroundStyle(OBColor.foreground)
            Text(message)
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundStyle(OBColor.mutedForeground)
                .padding(.horizontal, OBSpacing.lg)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(OBColor.background)
    }
}

struct ComingSoonView: View {
    let title: String
    let systemImage: String

    var body: some View {
        VStack(spacing: OBSpacing.sm) {
            Image(systemName: systemImage)
                .font(.system(size: 34))
                .foregroundStyle(OBColor.mutedForeground)
            Text(title)
                .font(.headline)
                .foregroundStyle(OBColor.foreground)
            Text("Próximamente en la app móvil.")
                .font(.subheadline)
                .foregroundStyle(OBColor.mutedForeground)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(OBColor.background)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
