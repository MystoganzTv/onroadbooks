import Foundation

/// What the phone is looking at: a period, and a truck or the whole fleet.
///
/// This mirrors the web app, where the same two live in the URL so that every
/// server component on a page computes from one range (see `PeriodControls`
/// and `src/lib/period-params.ts`). The phone has no URL, so the same state
/// lives here and `APIRepository` reads it on every request.
///
/// Nothing here resolves a period into dates. `resolvePeriod` on the server is
/// the only thing that turns "second half of August" into a start and an end,
/// and it stays the only thing — the phone sends the same query string the web
/// puts in its address bar and reads `periodLabel` back for display.
enum PeriodKey: String, CaseIterable {
    case today, week, first, second, full, quarter, ytd, custom

    /// The web's `PERIOD_OPTIONS` grouping, kept so the control can draw the
    /// same separators between quick / month / long.
    enum Group { case quick, month, long }

    var group: Group {
        switch self {
        case .today, .week: return .quick
        case .first, .second, .full: return .month
        case .quarter, .ytd, .custom: return .long
        }
    }

    /// `PERIOD_OPTIONS[].short`, in the app's Spanish.
    var shortLabel: String {
        switch self {
        case .today: return "Hoy"
        case .week: return "Semana"
        case .first: return "1-15"
        case .second: return "16-fin"
        case .full: return "Mes"
        case .quarter: return "Trim"
        case .ytd: return "YTD"
        case .custom: return "Rango"
        }
    }

    /// The options the bar draws, in the web's order. `custom` is excluded for
    /// the same reason the web excludes it: it is a popover, not a chip.
    static let barOptions: [PeriodKey] = [.today, .week, .first, .second, .full, .quarter, .ytd]
}

/// The period keys whose range does not depend on the month selector —
/// `FLOATING_PERIODS` in `src/lib/periods.ts`.
private let floatingPeriods: Set<PeriodKey> = [.today, .week, .custom]

struct Scope: Equatable, Hashable {
    /// The anchor month the selector sits on, "2026-08".
    var month: String
    var key: PeriodKey
    /// Set for the floating periods only, "YYYY-MM-DD".
    var from: String?
    var to: String?
    /// nil is the whole fleet, which is what `truckFromSearchParams` calls
    /// "all".
    var truckId: String?

    static func current() -> Scope {
        Scope(month: OBDate.currentMonth(), key: .full, from: nil, to: nil, truckId: nil)
    }

    /// `scopeQuery(period, truckId)` from `src/lib/period-params.ts`, item for
    /// item. Sending anything else — or resolving the dates here — would let
    /// the phone disagree with the browser about what "this month" means.
    var queryItems: [URLQueryItem] {
        var items = [
            URLQueryItem(name: "month", value: month),
            URLQueryItem(name: "period", value: key.rawValue),
        ]
        if floatingPeriods.contains(key), let from, let to {
            items.append(URLQueryItem(name: "from", value: from))
            items.append(URLQueryItem(name: "to", value: to))
        }
        if let truckId {
            items.append(URLQueryItem(name: "truck", value: truckId))
        }
        return items
    }
}

/// The calendar arithmetic the web's `PeriodControls` does in the browser, and
/// only that. "Today" and "This week" are resolved from the phone's calendar
/// and sent explicitly, because the server would otherwise answer in its own
/// timezone — which can be a day out from the person entering the loads. Every
/// other period is resolved on the server.
enum OBDate {
    private static var isoFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }

    private static var monthFormatter: DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM"
        return formatter
    }

    static func todayISO() -> String { isoFormatter.string(from: Date()) }

    static func currentMonth() -> String { monthFormatter.string(from: Date()) }

    /// `weekRange` — Monday to Sunday, inclusive.
    static func weekRange(_ date: Date = Date()) -> (start: String, end: String) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.firstWeekday = 2 // Monday, matching `(d.getDay() + 6) % 7`
        let startOfDay = calendar.startOfDay(for: date)
        let weekday = calendar.component(.weekday, from: startOfDay)
        let offset = (weekday + 5) % 7 // Monday = 0
        guard let start = calendar.date(byAdding: .day, value: -offset, to: startOfDay),
              let end = calendar.date(byAdding: .day, value: 6, to: start)
        else { return (isoFormatter.string(from: startOfDay), isoFormatter.string(from: startOfDay)) }
        return (isoFormatter.string(from: start), isoFormatter.string(from: end))
    }

    /// `shiftMonth(month, delta)`.
    static func shiftMonth(_ month: String, by delta: Int) -> String {
        guard let date = monthFormatter.date(from: month),
              let shifted = Calendar(identifier: .gregorian).date(byAdding: .month, value: delta, to: date)
        else { return month }
        return monthFormatter.string(from: shifted)
    }

    /// `monthOptions(anchor)` — two years back through next month, newest
    /// first.
    static func monthOptions(around anchor: String) -> [(value: String, label: String)] {
        Array(
            (-24...1).map { offset -> (value: String, label: String) in
                let value = shiftMonth(anchor, by: offset)
                return (value, monthLabel(value))
            }.reversed()
        )
    }

    static func monthLabel(_ month: String) -> String {
        guard let date = monthFormatter.date(from: month) else { return month }
        let display = DateFormatter()
        display.locale = .current
        display.setLocalizedDateFormatFromTemplate("MMMM yyyy")
        let text = display.string(from: date)
        return text.prefix(1).uppercased() + text.dropFirst()
    }
}

/// Holds the scope for the whole app, the way the URL does on the web.
///
/// One store, injected once, so switching to "16 - End" changes what every
/// screen asks for rather than what one screen remembers.
@MainActor
final class ScopeStore: ObservableObject {
    @Published private(set) var scope: Scope = .current() { didSet { box.set(scope) } }
    /// For `APIRepository`, which builds its query items off the main actor
    /// and must not hop onto it to ask what the bar is set to. Same pattern as
    /// `NetworkMonitor.flag`.
    nonisolated let box = ScopeBox()
    /// The trucks the switcher offers. Empty until a screen that knows them
    /// fills it in; an empty list means the switcher stays hidden rather than
    /// offering a choice the account does not have.
    @Published var trucks: [TruckChoice] = []

    struct TruckChoice: Equatable, Identifiable {
        let id: String
        let name: String
    }

    func select(_ key: PeriodKey) {
        switch key {
        case .today:
            let today = OBDate.todayISO()
            scope = Scope(month: String(today.prefix(7)), key: .today, from: today, to: today, truckId: scope.truckId)
        case .week:
            let week = OBDate.weekRange()
            scope = Scope(month: String(week.start.prefix(7)), key: .week, from: week.start, to: week.end, truckId: scope.truckId)
        default:
            scope = Scope(month: scope.month, key: key, from: nil, to: nil, truckId: scope.truckId)
        }
    }

    func selectMonth(_ month: String) {
        // Matching the web: choosing a month from the picker, or stepping with
        // the arrows, also puts you back on the full month.
        scope = Scope(month: month, key: .full, from: nil, to: nil, truckId: scope.truckId)
    }

    func stepMonth(_ delta: Int) {
        selectMonth(OBDate.shiftMonth(scope.month, by: delta))
    }

    func selectCustom(from: String, to: String) {
        scope = Scope(month: scope.month, key: .custom, from: from, to: to, truckId: scope.truckId)
    }

    /// Called from a screen's `reload()`, which is not on the main actor —
    /// hence a method rather than a bare property write.
    func setTrucks(_ trucks: [TruckChoice]) {
        if self.trucks != trucks { self.trucks = trucks }
    }

    func selectTruck(_ truckId: String?) {
        scope = Scope(month: scope.month, key: scope.key, from: scope.from, to: scope.to, truckId: truckId)
    }
}


/// A `Scope` that is safe to read from any thread.
final class ScopeBox: @unchecked Sendable {
    private let lock = NSLock()
    private var value = Scope.current()

    var current: Scope {
        lock.lock()
        defer { lock.unlock() }
        return value
    }

    func set(_ newValue: Scope) {
        lock.lock()
        value = newValue
        lock.unlock()
    }
}
