import XCTest

/// Run Scripts/refresh-ui-fixtures.mjs first, on an isolated simulator.
/// Exercises the actual pull gesture with delayed HTTP responses.
@MainActor
final class RefreshUITests: XCTestCase {
    private let base = URL(string: "http://127.0.0.1:4187")!

    private func fixture(_ path: String) async throws {
        var request = URLRequest(url: base.appendingPathComponent(path))
        request.httpMethod = "POST"
        let (_, response) = try await URLSession.shared.data(for: request)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
    }

    func testRefreshLoadNumbersAndDispatcherAppearance() async throws {
        try await fixture("test/reset")
        let app = XCUIApplication()
        app.launchEnvironment["ONROAD_API_BASE_URL"] = base.absoluteString
        app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        if app.tabBars.buttons["More"].waitForExistence(timeout: 2) {
            app.tabBars.buttons["More"].tap()
            let settings = app.buttons["Settings"]
            for _ in 0..<5 where !settings.isHittable { app.swipeUp() }
            settings.tap()
            let signOut = app.buttons["Sign Out"]
            for _ in 0..<5 where !signOut.isHittable { app.swipeUp() }
            signOut.tap()
            try await fixture("test/reset")
        }
        let email = app.textFields["Correo"]
        XCTAssertTrue(email.waitForExistence(timeout: 15))
        email.tap(); email.typeText("refresh@example.test")
        app.secureTextFields["Contraseña"].tap()
        app.secureTextFields["Contraseña"].typeText("local-fixture-only")
        app.buttons["Entrar"].tap()
        XCTAssertTrue(app.staticTexts["Refresh 1"].waitForExistence(timeout: 15))

        for count in 2...4 {
            pull(app.scrollViews["dashboard-scroll"])
            XCTAssertTrue(app.staticTexts["Refresh \(count)"].waitForExistence(timeout: 10))
            XCTAssertTrue(app.staticTexts["BOOKED REVENUE"].exists)
        }
        try await fixture("test/fail-next-dashboard")
        pull(app.scrollViews["dashboard-scroll"])
        XCTAssertTrue(app.staticTexts["No se pudo conectar. Revisa la señal e intenta otra vez."].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Refresh 4"].exists)
        XCTAssertTrue(app.staticTexts["BOOKED REVENUE"].exists)
        pull(app.scrollViews["dashboard-scroll"])
        XCTAssertTrue(app.staticTexts["Refresh 5"].waitForExistence(timeout: 10))
        capture(app, "Refresh-dashboard-recovered")

        app.tabBars.buttons["Loads"].tap()
        let number = app.staticTexts["load-number-refresh-load"]
        let route = app.staticTexts["load-route-refresh-load"]
        XCTAssertTrue(number.waitForExistence(timeout: 10))
        XCTAssertEqual(number.label, "#QA-48120375")
        XCTAssertLessThan(number.frame.minY, route.frame.minY)
        XCTAssertGreaterThan(number.frame.height, route.frame.height)
        XCTAssertEqual(app.staticTexts["load-number-no-number"].label, "Sin número de carga")
        capture(app, "Loads-number-first")

        app.tabBars.buttons["More"].tap()
        app.buttons["Dispatchers"].tap()
        XCTAssertTrue(app.staticTexts["Sample Dispatch"].waitForExistence(timeout: 10))
        capture(app, "Dispatchers-dark")
        app.staticTexts["Sample Dispatch"].tap()
        XCTAssertTrue(app.textFields["Nombre"].waitForExistence(timeout: 10))
        capture(app, "Dispatcher-editor-dark")

        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.buttons["Reserves"].tap()
        let suggested = app.staticTexts["reserve-suggested-total"]
        XCTAssertTrue(suggested.waitForExistence(timeout: 10))
        XCTAssertEqual(suggested.label, "$1,672.87")
        XCTAssertEqual(app.staticTexts["reserve-recorded-total"].label, "$0.00")
        let reserves = app.scrollViews["reserves-scroll"]
        let tax = app.staticTexts["reserve-suggested-res_tax"]
        for _ in 0..<3 where !tax.isHittable { reserves.swipeUp() }
        XCTAssertEqual(tax.label, "$987.22")
        let maintenance = app.staticTexts["reserve-suggested-res_maintenance"]
        for _ in 0..<3 where !maintenance.isHittable { reserves.swipeUp() }
        XCTAssertEqual(maintenance.label, "$489.75")
        capture(app, "Reserves-calculated-and-recorded")
    }

    private func pull(_ scroll: XCUIElement) {
        let start = scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.2))
        let end = scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.85))
        start.press(forDuration: 0.05, thenDragTo: end)
    }

    private func capture(_ app: XCUIApplication, _ name: String) {
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = name
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }
}
