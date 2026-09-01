import Foundation

/// One write that has not reached the ledger yet.
///
/// Stored as the raw request — path plus JSON body — rather than as a domain
/// object, so every write endpoint the app has (and every one it gains) is
/// queueable without teaching this file about loads, expenses or fuel.
struct QueuedWrite: Identifiable, Codable, Equatable {
    enum State: String, Codable {
        /// Will be sent on its own as soon as there is signal.
        case waiting
        /// Needs a decision from the owner: either it may already be saved, or
        /// the ledger refused it for a reason retrying will not change.
        case attention
    }

    let id: UUID
    let path: String
    let body: Data
    /// What to call this in a list. Written by whoever queued it, in the
    /// owner's language, because "POST api/mobile/expenses" helps nobody.
    let summary: String
    let amount: Double?
    let queuedAt: Date
    var state: State
    var note: String?
}

/// Writes that could not be sent, held until they can be.
///
/// The rule this file exists to enforce: **a write is only ever retried by
/// itself when we know the server never saw it.** Anything ambiguous stops and
/// asks. Money entered twice is worse than money entered late.
@MainActor
final class WriteQueue: ObservableObject {
    @Published private(set) var items: [QueuedWrite] = []
    @Published private(set) var isSending = false

    private let client: APIClient
    private let fileURL: URL

    var waiting: [QueuedWrite] { items.filter { $0.state == .waiting } }
    var needsAttention: [QueuedWrite] { items.filter { $0.state == .attention } }

    init(client: APIClient, filename: String = "pending-writes.json") {
        self.client = client
        let directory = (try? FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
        )) ?? URL(fileURLWithPath: NSTemporaryDirectory())
        fileURL = directory.appendingPathComponent(filename)
        load()
    }

    // MARK: - Queueing

    /// Returns a local placeholder id so the caller can carry on. The write is
    /// real to the owner the moment it is on disk; only the server does not
    /// know about it yet.
    @discardableResult
    func enqueue(
        path: String,
        body: Data,
        summary: String,
        amount: Double?,
        state: QueuedWrite.State = .waiting,
        note: String? = nil
    ) -> String {
        let write = QueuedWrite(
            id: UUID(), path: path, body: body, summary: summary, amount: amount,
            queuedAt: Date(), state: state, note: note
        )
        items.append(write)
        save()
        return "pendiente:\(write.id.uuidString)"
    }

    // MARK: - Sending

    /// Sends everything waiting, oldest first, and stops at the first sign that
    /// there is still no signal — hammering a dead connection drains a battery
    /// that a driver may need for a phone call.
    func flush() async {
        guard !isSending, !waiting.isEmpty else { return }
        isSending = true
        defer { isSending = false }

        for write in waiting {
            let keepGoing = await send(write)
            if !keepGoing { break }
        }
    }

    /// One write, on the owner's explicit instruction. Used for the ambiguous
    /// ones, which never move on their own.
    func retry(_ write: QueuedWrite) async {
        guard !isSending else { return }
        isSending = true
        defer { isSending = false }
        _ = await send(write)
    }

    func discard(_ write: QueuedWrite) {
        items.removeAll { $0.id == write.id }
        save()
    }

    /// Returns whether it is worth trying the next one.
    private func send(_ write: QueuedWrite) async -> Bool {
        do {
            let (data, http) = try await client.send(client.post(write.path, body: write.body))
            _ = try APIClient.outcome(data, http)
            items.removeAll { $0.id == write.id }
            save()
            return true
        } catch APIError.transport(let failure) {
            if failure.neverSent {
                // Still no signal. Leave it exactly as it is and stop.
                return false
            }
            mark(write, .attention, "Se perdió la conexión al enviarlo. Puede que ya esté guardado — revísalo antes de reintentar.")
            return false
        } catch APIError.unauthorized {
            mark(write, .attention, "Tu sesión expiró. Entra de nuevo y reintenta.")
            return false
        } catch APIError.refused(let message) {
            // The ledger said no, and it will say no again.
            mark(write, .attention, message)
            return true
        } catch {
            mark(write, .attention, "No se pudo enviar.")
            return false
        }
    }

    private func mark(_ write: QueuedWrite, _ state: QueuedWrite.State, _ note: String) {
        guard let index = items.firstIndex(where: { $0.id == write.id }) else { return }
        items[index].state = state
        items[index].note = note
        save()
    }

    // MARK: - Persistence
    //
    // A queue that dies with the app process is not a queue: the phone gets
    // closed, put in a pocket, and killed by the system long before the truck
    // finds a bar of signal.

    private func load() {
        guard let data = try? Data(contentsOf: fileURL),
              let stored = try? JSONDecoder().decode([QueuedWrite].self, from: data) else { return }
        items = stored
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(items) else { return }
        try? data.write(to: fileURL, options: [.atomic, .completeFileProtection])
    }
}
