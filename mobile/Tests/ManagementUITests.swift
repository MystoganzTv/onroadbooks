import XCTest

/// Requires the disposable JSON backend on localhost:4173. Never contacts a
/// production account, Stripe, email delivery or App Store Connect.
@MainActor
final class ManagementUITests: XCTestCase {
    func testNativeBrokerRoundTripAndManagementNavigation() async throws {
        let base = URL(string: "http://127.0.0.1:4173")!
        let email = "native-\(UUID().uuidString.lowercased())@example.test"
        let password = "Native-only-test-password-2026"
        let brokerName = "Native Broker \(UUID().uuidString.prefix(8))"
        var setup = URLRequest(url: base.appendingPathComponent("api/auth/setup"))
        setup.httpMethod = "POST"
        setup.setValue("application/json", forHTTPHeaderField: "Content-Type")
        setup.httpBody = try JSONSerialization.data(withJSONObject: ["name": "Native Test", "email": email, "password": password, "businessName": "Native Test Books"])
        let (_, response) = try await URLSession.shared.data(for: setup)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 201)

        let app = XCUIApplication()
        app.launchEnvironment["ONROAD_API_BASE_URL"] = base.absoluteString
        app.launch()
        if app.tabBars.buttons["More"].waitForExistence(timeout: 3) {
            app.tabBars.buttons["More"].tap()
            let settings = app.buttons["Settings"]
            for _ in 0..<4 where !settings.isHittable { app.swipeUp() }
            settings.tap()
            let signOut = app.buttons["Sign Out"]
            for _ in 0..<4 where !signOut.isHittable { app.swipeUp() }
            signOut.tap()
        }
        let emailField = app.textFields["Correo"]
        XCTAssertTrue(emailField.waitForExistence(timeout: 15))
        emailField.tap(); emailField.typeText(email)
        let passwordField = app.secureTextFields["Contraseña"]
        passwordField.tap(); passwordField.typeText(password)
        app.buttons["Entrar"].tap()
        XCTAssertTrue(app.tabBars.buttons["More"].waitForExistence(timeout: 30))
        app.tabBars.buttons["More"].tap()
        app.buttons["Brokers"].tap()
        let addButton = app.buttons["Agregar"]
        XCTAssertTrue(addButton.waitForExistence(timeout: 30))
        addButton.tap()
        let name = app.textFields["Nombre"]
        XCTAssertTrue(name.waitForExistence(timeout: 10))
        name.tap(); name.typeText(brokerName)
        app.swipeUp()
        let save = app.buttons["Guardar cambios"]
        for _ in 0..<4 where !save.isHittable { app.swipeUp() }
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(app.staticTexts[brokerName].waitForExistence(timeout: 20))
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Native brokers after save"
        attachment.lifetime = .keepAlways
        add(attachment)

        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.buttons["Financing"].tap()
        app.buttons["Préstamos y arrendamientos"].tap()
        XCTAssertTrue(app.buttons["Agregar"].waitForExistence(timeout: 20))
        app.buttons["Agregar"].tap()
        let loanName = app.textFields["Nombre"]
        XCTAssertTrue(loanName.waitForExistence(timeout: 10))
        loanName.tap(); loanName.typeText("Native Loan")
        let balance = app.textFields["Saldo inicial ($)"]
        for _ in 0..<3 where !balance.isHittable { app.swipeUp() }
        balance.tap(); balance.typeText("10000")
        let loanSave = app.buttons["Guardar cambios"]
        for _ in 0..<6 where !loanSave.isHittable { app.swipeUp() }
        XCTAssertTrue(loanSave.isEnabled)
        loanSave.tap()
        XCTAssertTrue(app.staticTexts["Native Loan"].waitForExistence(timeout: 20))
        let financingScreenshot = XCTAttachment(screenshot: app.screenshot())
        financingScreenshot.name = "Native financing after save"
        financingScreenshot.lifetime = .keepAlways
        add(financingScreenshot)

        // Independent API read proves the native form persisted, not just that
        // its local state changed or an optimistic row appeared.
        var login = URLRequest(url: base.appendingPathComponent("api/mobile/login"))
        login.httpMethod = "POST"; login.setValue("application/json", forHTTPHeaderField: "Content-Type")
        login.httpBody = try JSONSerialization.data(withJSONObject: ["email": email, "password": password])
        let (loginData, _) = try await URLSession.shared.data(for: login)
        let token = try XCTUnwrap((try JSONSerialization.jsonObject(with: loginData) as? [String: Any])?["token"] as? String)
        var read = URLRequest(url: base.appendingPathComponent("api/mobile/manage/brokers"))
        read.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, _) = try await URLSession.shared.data(for: read)
        let records = (try JSONSerialization.jsonObject(with: data) as? [String: Any])?["records"] as? [[String: Any]]
        XCTAssertTrue(records?.contains { $0["title"] as? String == brokerName } == true)

        // Pop the nested financing navigation before opening Settings.
        for _ in 0..<2 { app.navigationBars.buttons.element(boundBy: 0).tap() }
        let settings = app.buttons["Settings"]
        for _ in 0..<5 where !settings.isHittable { app.swipeUp() }
        settings.tap()
        let appearance = app.buttons["appearance-picker"]
        for _ in 0..<3 where !appearance.isHittable { app.swipeUp() }
        appearance.tap()
        app.buttons["Claro"].tap()
        let lightScreenshot = XCTAttachment(screenshot: app.screenshot())
        lightScreenshot.name = "Native light appearance"
        lightScreenshot.lifetime = .keepAlways
        add(lightScreenshot)
        let signOut = app.buttons["Sign Out"]
        for _ in 0..<5 where !signOut.isHittable { app.swipeUp() }
        signOut.tap()
        let register = app.buttons["Crear cuenta"]
        for _ in 0..<3 where !register.isHittable { app.swipeUp() }
        register.tap()
        let signupName = app.textFields["Tu nombre"]
        XCTAssertTrue(signupName.waitForExistence(timeout: 10))
        signupName.tap(); signupName.typeText("Native Signup")
        app.textFields["Nombre del negocio"].tap()
        app.textFields["Nombre del negocio"].typeText("Native Signup Books")
        app.textFields["account-access-email"].tap()
        app.textFields["account-access-email"].typeText("native-signup-\(UUID().uuidString.lowercased())@example.test")
        app.secureTextFields["Contraseña nueva"].tap()
        app.secureTextFields["Contraseña nueva"].typeText(password)
        app.secureTextFields["Repetir contraseña"].tap()
        app.secureTextFields["Repetir contraseña"].typeText(password)
        let create = app.buttons["account-access-submit"]
        for _ in 0..<3 where !create.isHittable { app.swipeUp() }
        create.tap()
        XCTAssertTrue(app.tabBars.buttons["More"].waitForExistence(timeout: 30))
    }
}
