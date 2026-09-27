import Foundation

enum APIConfig {
    static var baseURL: URL {
        // Simulator-only local verification. Release and physical-device builds
        // always use production; no bearer token or credential lives in config.
        #if DEBUG && targetEnvironment(simulator)
        if let raw = ProcessInfo.processInfo.environment["ONROAD_API_BASE_URL"],
           let url = URL(string: raw),
           ["localhost", "127.0.0.1"].contains(url.host ?? ""),
           ["http", "https"].contains(url.scheme ?? "") { return url }
        #endif
        return URL(string: "https://onroadbooks.com")!
    }
}
