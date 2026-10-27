import XCTest
@testable import OnRoad_Books

@MainActor
final class DashboardRefreshTests: XCTestCase {
    func testFailedAndCancelledRefreshesKeepTheLastDashboard() async throws {
        let snapshot = try await MockRepository().fetchDashboard()
        var failure: Error?
        let model = DashboardViewModel {
            if let failure { throw failure }
            return snapshot
        }
        await model.load()
        XCTAssertEqual(model.snapshot?.bookedRevenue, snapshot.bookedRevenue)

        failure = URLError(.cancelled)
        await model.load()
        XCTAssertEqual(model.snapshot?.bookedRevenue, snapshot.bookedRevenue)
        XCTAssertNil(model.refreshFailure)

        failure = APIError.requestFailed
        await model.load()
        XCTAssertEqual(model.snapshot?.bookedRevenue, snapshot.bookedRevenue)
        XCTAssertNotNil(model.refreshFailure)
        XCTAssertFalse(model.isLoading)

        failure = nil
        await model.load()
        XCTAssertEqual(model.snapshot?.recentLoads.first?.loadNumber, snapshot.recentLoads.first?.loadNumber)
        XCTAssertNil(model.refreshFailure)
    }

    func testAnOlderFailureCannotOverwriteANewerSuccessfulRefresh() async throws {
        let snapshot = try await MockRepository().fetchDashboard()
        var pending: CheckedContinuation<DashboardSnapshot, Error>?
        let started = expectation(description: "Older request is suspended")
        var count = 0
        let model = DashboardViewModel {
            count += 1
            if count == 1 {
                return try await withCheckedThrowingContinuation { continuation in
                    pending = continuation
                    started.fulfill()
                }
            }
            return snapshot
        }
        let old = Task { await model.load() }
        await fulfillment(of: [started], timeout: 1)
        await model.load()
        pending?.resume(throwing: APIError.requestFailed)
        await old.value

        XCTAssertEqual(model.snapshot?.bookedRevenue, snapshot.bookedRevenue)
        XCTAssertNil(model.refreshFailure)
        XCTAssertFalse(model.isLoading)
    }

    func testAnOlderSuccessCannotEraseANewerRefreshFailure() async throws {
        let snapshot = try await MockRepository().fetchDashboard()
        var pending: CheckedContinuation<DashboardSnapshot, Error>?
        let started = expectation(description: "Older request is suspended")
        var count = 0
        let model = DashboardViewModel {
            count += 1
            if count == 1 { return snapshot }
            if count == 2 {
                return try await withCheckedThrowingContinuation { continuation in
                    pending = continuation
                    started.fulfill()
                }
            }
            throw APIError.requestFailed
        }
        await model.load()
        let old = Task { await model.load() }
        await fulfillment(of: [started], timeout: 1)
        await model.load()
        pending?.resume(returning: snapshot)
        await old.value

        XCTAssertEqual(model.snapshot?.bookedRevenue, snapshot.bookedRevenue)
        XCTAssertNotNil(model.refreshFailure)
        XCTAssertFalse(model.isLoading)
    }
}
