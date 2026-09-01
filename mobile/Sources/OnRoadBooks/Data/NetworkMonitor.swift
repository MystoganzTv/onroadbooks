import Foundation
import Network

/// Is there a usable path to the network right now?
///
/// Checked BEFORE a write is attempted, not after it fails: knowing the phone
/// is offline turns a write into a queued write with no ambiguity at all, which
/// is the difference between "we will send this later" and "we do not know
/// whether this was saved".
@MainActor
final class NetworkMonitor: ObservableObject {
    /// For the UI.
    @Published private(set) var isOnline = true
    /// For the write path, which runs off the main actor and must not have to
    /// hop onto it just to ask whether there is signal.
    nonisolated let flag = OnlineFlag()

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "com.onroadbooks.network-monitor")

    init() {
        monitor.pathUpdateHandler = { [flag] path in
            let online = path.status == .satisfied
            flag.set(online)
            Task { @MainActor in
                NotificationCenter.default.post(name: .obNetworkPathChanged, object: online)
            }
        }
        monitor.start(queue: queue)
    }

    /// Called from the view layer when the notification arrives, so the
    /// published value only ever changes on the main actor.
    func apply(online: Bool) {
        if isOnline != online { isOnline = online }
    }

    deinit { monitor.cancel() }
}

extension Notification.Name {
    static let obNetworkPathChanged = Notification.Name("com.onroadbooks.networkPathChanged")
}

/// A boolean that is safe to read from any thread.
final class OnlineFlag: @unchecked Sendable {
    private let lock = NSLock()
    private var value = true

    var current: Bool {
        lock.lock()
        defer { lock.unlock() }
        return value
    }

    func set(_ newValue: Bool) {
        lock.lock()
        value = newValue
        lock.unlock()
    }
}
