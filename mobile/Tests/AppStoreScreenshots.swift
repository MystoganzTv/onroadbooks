import XCTest

/// Captures the shipped interface with sample data only. Run on an isolated
/// simulator without an existing account; no network or customer data is used.
@MainActor
final class AppStoreScreenshots: XCTestCase {
    func testSampleScreens() throws {
        let app = XCUIApplication()
        app.launch()
        let demo = app.buttons["Ver con datos de muestra"]
        XCTAssertTrue(demo.waitForExistence(timeout: 15))
        for _ in 0..<3 where !demo.isHittable { app.swipeUp() }
        demo.tap()
        XCTAssertTrue(app.buttons["More"].firstMatch.waitForExistence(timeout: 15))
        capture(app, "01-Dashboard")
        app.buttons["Loads"].firstMatch.tap()
        XCTAssertTrue(app.buttons["More"].firstMatch.exists)
        capture(app, "02-Loads")
        app.buttons["Expenses"].firstMatch.tap()
        capture(app, "03-Expenses")
        app.buttons["More"].firstMatch.tap()
        app.buttons["Load Calculator"].tap()
        capture(app, "04-Calculator")
    }

    private func capture(_ app: XCUIApplication, _ name: String) {
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = name
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }
}
