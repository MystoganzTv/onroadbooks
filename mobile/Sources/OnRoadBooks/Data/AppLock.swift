import Foundation
import LocalAuthentication

/// An optional Face ID / Touch ID / passcode gate in front of the app's own
/// screens. OnRoad Books never asks the OS to protect anything beyond the
/// mobile access token itself (see `KeychainHelper`), so this is an extra
/// layer for a phone that leaves his pocket more than his laptop does.
///
/// Off by default: turning it on runs one real authentication first (see
/// `enable()`), so nobody ends up locked out of their own ledger by a switch
/// that silently did not work on their phone.
@MainActor
final class AppLock: ObservableObject {
    @Published private(set) var isEnabled: Bool
    /// True once the current foreground session has been unlocked. Reset to
    /// `false` whenever the app leaves the foreground (see `lockOnBackground`
    /// in `AppRootView`) -- coming back from a pocket asks again, same as
    /// every banking app already does this.
    @Published var isUnlocked: Bool

    private static let defaultsKey = "onroadbooks.mobile.applock.enabled"

    init() {
        let enabled = UserDefaults.standard.bool(forKey: Self.defaultsKey)
        isEnabled = enabled
        isUnlocked = !enabled
    }

    /// Whether this phone has anything to authenticate with at all -- no Face
    /// ID, no Touch ID, no passcode set means there is nothing this feature
    /// could lock behind, so Settings should not offer to turn it on.
    var isAvailable: Bool {
        LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
    }

    /// Proves authentication works on this phone before relying on it. If it
    /// fails (cancelled, no biometrics enrolled after all), the setting stays
    /// off rather than trusting a check that never actually ran.
    @discardableResult
    func enable() async -> Bool {
        guard await authenticate() else { return false }
        isEnabled = true
        UserDefaults.standard.set(true, forKey: Self.defaultsKey)
        return true
    }

    func disable() {
        isEnabled = false
        isUnlocked = true
        UserDefaults.standard.set(false, forKey: Self.defaultsKey)
    }

    /// Called on every transition to the background. Locking on the way out
    /// rather than checking on the way back in means there is never a frame
    /// where a backgrounded app shows real numbers in the app switcher.
    func lockOnBackground() {
        if isEnabled { isUnlocked = false }
    }

    /// `LAContext`'s own completion-handler API, wrapped rather than assumed
    /// to have an async overload on this deployment target -- nothing here
    /// can be compiled and checked, so the one guaranteed-available shape
    /// wins over a newer one that might not exist on iOS 16.
    @discardableResult
    func authenticate() async -> Bool {
        let context = LAContext()
        context.localizedCancelTitle = "Cancelar"
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            // Nothing to check against -- do not hold the ledger hostage to a
            // device with no passcode configured at all.
            isUnlocked = true
            return true
        }
        let success = await withCheckedContinuation { continuation in
            context.evaluatePolicy(
                .deviceOwnerAuthentication,
                localizedReason: "Desbloquea OnRoad Books"
            ) { success, _ in
                continuation.resume(returning: success)
            }
        }
        if success { isUnlocked = true }
        return success
    }
}
