import SwiftUI
import UIKit

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

/// Semantic colours shared with globals.css. UIKit resolves the selected
/// appearance for SwiftUI, including sheets, charts and system controls.
enum OBColor {
    private static func adaptive(light: (Double, Double, Double), dark: (Double, Double, Double)) -> Color {
        let lightColor = UIColor(Color(h: light.0, s: light.1, l: light.2))
        let darkColor = UIColor(Color(h: dark.0, s: dark.1, l: dark.2))
        return Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? darkColor : lightColor })
    }

    // Surfaces
    static let background = adaptive(light: (210, 20, 97), dark: (216, 30, 7))
    static let surface = adaptive(light: (0, 0, 100), dark: (216, 26, 10))
    static let surfaceRaised = adaptive(light: (210, 20, 99), dark: (215, 24, 13))
    static let surfaceSunken = adaptive(light: (210, 20, 94), dark: (217, 32, 6))
    static let card = surface

    // Text
    static let foreground = adaptive(light: (215, 28, 12), dark: (210, 28, 92))
    static let mutedForeground = adaptive(light: (215, 14, 42), dark: (214, 14, 58))

    // Structure
    static let border = adaptive(light: (214, 18, 87), dark: (215, 22, 18))
    static let secondary = adaptive(light: (210, 18, 93), dark: (215, 22, 16))

    // Brand
    static let primary = adaptive(light: (217, 91, 52), dark: (213, 94, 60))            // bright blue
    static let primaryForeground = adaptive(light: (0, 0, 100), dark: (216, 40, 8))

    // Sidebar / chrome (used here for the tab bar + nav chrome)
    static let sidebar = adaptive(light: (0, 0, 100), dark: (217, 33, 8))
    static let sidebarForeground = adaptive(light: (215, 14, 42), dark: (213, 18, 66))

    // Financial performance ONLY — never decorative, never a plain ranking.
    static let pos = adaptive(light: (152, 62, 34), dark: (152, 58, 48))                // green
    static let posSoft = adaptive(light: (152, 55, 92), dark: (152, 45, 14))
    static let neg = adaptive(light: (0, 72, 48), dark: (0, 76, 62))                  // red
    static let negSoft = adaptive(light: (0, 80, 95), dark: (0, 50, 16))
    static let warn = adaptive(light: (35, 92, 42), dark: (38, 92, 55))                // amber
    static let warnSoft = adaptive(light: (40, 90, 92), dark: (38, 60, 14))
    static let info = adaptive(light: (217, 91, 52), dark: (213, 94, 62))               // blue
    static let infoSoft = adaptive(light: (214, 95, 94), dark: (214, 60, 16))
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
