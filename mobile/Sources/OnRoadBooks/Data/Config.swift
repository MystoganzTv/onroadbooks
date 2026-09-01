import Foundation

enum APIConfig {
    /// Production API base. `/api/mobile/*` was added to the SAME Next.js
    /// app OnRoad Books already runs at this domain (see project memory
    /// `onroadbooks_mobile.md`) — there is no separate mobile backend.
    ///
    /// To point at a local `npm run dev` instead while developing: change
    /// this to `http://localhost:3000` AND add an ATS exception for
    /// localhost in Info.plist (`NSAppTransportSecurity` /
    /// `NSExceptionDomains`), since iOS blocks plain HTTP by default. Don't
    /// ship a build with either change.
    static let baseURL = URL(string: "https://onroadbooks.com")!
}
