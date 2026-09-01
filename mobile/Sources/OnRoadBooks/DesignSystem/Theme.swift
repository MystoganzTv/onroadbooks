import SwiftUI

// MARK: - HSL → Color

extension Color {
    /// h in degrees [0,360), s/l as percentages [0,100]. Mirrors CSS's
    /// `hsl()` so every value below can be copy-pasted straight out of
    /// the web app's `globals.css` custom properties.
    init(h: Double, s: Double, l: Double, opacity: Double = 1) {
        let s = s / 100, l = l / 100
        let c = (1 - abs(2 * l - 1)) * s
        let hp = h / 60
        let x = c * (1 - abs(hp.truncatingRemainder(dividingBy: 2) - 1))
        let m = l - c / 2
        let (r, g, b): (Double, Double, Double)
        switch hp {
        case 0..<1: (r, g, b) = (c, x, 0)
        case 1..<2: (r, g, b) = (x, c, 0)
        case 2..<3: (r, g, b) = (0, c, x)
        case 3..<4: (r, g, b) = (0, x, c)
        case 4..<5: (r, g, b) = (x, 0, c)
        default: (r, g, b) = (c, 0, x)
        }
        self.init(.sRGB, red: r + m, green: g + m, blue: b + m, opacity: opacity)
    }
}

/// Colour tokens ported 1:1 from `src/app/globals.css`'s `.dark` block —
/// the web app's PRIMARY operating theme (the light block is its
/// secondary/legacy theme and is intentionally not ported here; this app
/// always runs dark, like the cockpit it mirrors).
///
/// Colour discipline (Enrique, 2026-08-29, see project memory
/// `truckledger.md`): dark navy / deep blue / bright blue / white, a small
/// amount of amber. Green ONLY for positive financial performance, red
/// ONLY for negative or critical. A relative ranking ("weakest lane",
/// "slowest category") is NOT automatically bad — don't reach for
/// `OBColor.neg` just because something is last in a list.
enum OBColor {
    // Surfaces
    static let background = Color(h: 216, s: 30, l: 7)
    static let surface = Color(h: 216, s: 26, l: 10)
    static let surfaceRaised = Color(h: 215, s: 24, l: 13)
    static let surfaceSunken = Color(h: 217, s: 32, l: 6)
    static let card = surface

    // Text
    static let foreground = Color(h: 210, s: 28, l: 92)
    static let mutedForeground = Color(h: 214, s: 14, l: 58)

    // Structure
    static let border = Color(h: 215, s: 22, l: 18)
    static let secondary = Color(h: 215, s: 22, l: 16)

    // Brand
    static let primary = Color(h: 213, s: 94, l: 60)            // bright blue
    static let primaryForeground = Color(h: 216, s: 40, l: 8)

    // Sidebar / chrome (used here for the tab bar + nav chrome)
    static let sidebar = Color(h: 217, s: 33, l: 8)
    static let sidebarForeground = Color(h: 213, s: 18, l: 66)

    // Financial performance ONLY — never decorative, never a plain ranking.
    static let pos = Color(h: 152, s: 58, l: 48)                // green
    static let posSoft = Color(h: 152, s: 45, l: 14)
    static let neg = Color(h: 0, s: 76, l: 62)                  // red
    static let negSoft = Color(h: 0, s: 50, l: 16)
    static let warn = Color(h: 38, s: 92, l: 55)                // amber
    static let warnSoft = Color(h: 38, s: 60, l: 14)
    static let info = Color(h: 213, s: 94, l: 62)               // blue
    static let infoSoft = Color(h: 214, s: 60, l: 16)
}

enum OBRadius {
    static let card: CGFloat = 14
    static let control: CGFloat = 10
    static let chip: CGFloat = 999
}

enum OBSpacing {
    static let xs: CGFloat = 6
    static let sm: CGFloat = 10
    static let md: CGFloat = 14
    static let lg: CGFloat = 20
    static let xl: CGFloat = 28
}
