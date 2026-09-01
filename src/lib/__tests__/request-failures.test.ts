import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  failureFingerprint,
  isControlFlowError,
  reportRequestError,
  resetFailureTracking,
  shouldAlert,
} from "../operations";

beforeEach(() => {
  resetFailureTracking();
  delete process.env.OPERATIONS_ALERT_WEBHOOK_URL;
});

describe("grouping one failure across requests", () => {
  it("treats the same failure with different ids as one problem", () => {
    const a = failureFingerprint("/loads/[id]", "Load 3f2a9c11-0b7e-4f1a-9c2d-77e0b1a4c8d9 not found");
    const b = failureFingerprint("/loads/[id]", "Load 8ba01f77-1122-4bbb-9999-000111222333 not found");
    assert.equal(a, b);
  });

  it("keeps different routes and different problems apart", () => {
    assert.notEqual(
      failureFingerprint("/loads", "Connection terminated"),
      failureFingerprint("/expenses", "Connection terminated"),
    );
    assert.notEqual(
      failureFingerprint("/loads", "Connection terminated"),
      failureFingerprint("/loads", "Column does not exist"),
    );
  });
});

describe("how often an alert fires", () => {
  it("alerts once, then stays quiet while the same thing keeps breaking", () => {
    // A broken route fails on every request. An alert per request is how a
    // phone gets silenced, which is worse than no alerting at all.
    const print = failureFingerprint("/dashboard", "boom");
    const start = 1_000_000;
    assert.deepEqual(shouldAlert(print, start), { alert: true, occurrences: 1 });
    for (let i = 1; i <= 40; i += 1) {
      assert.equal(shouldAlert(print, start + i * 1_000).alert, false);
    }
  });

  it("comes back after the window with the count of what was suppressed", () => {
    const print = failureFingerprint("/dashboard", "boom");
    const start = 1_000_000;
    shouldAlert(print, start);
    shouldAlert(print, start + 60_000);
    shouldAlert(print, start + 120_000);

    const later = shouldAlert(print, start + 11 * 60_000);
    assert.equal(later.alert, true);
    // Three suppressed since the first alert, plus this one.
    assert.equal(later.occurrences, 4);
  });

  it("counts a second distinct failure separately", () => {
    const start = 1_000_000;
    assert.equal(shouldAlert(failureFingerprint("/a", "one"), start).alert, true);
    assert.equal(shouldAlert(failureFingerprint("/b", "two"), start).alert, true);
  });
});

describe("what is not a failure", () => {
  it("ignores redirect and not-found, which travel as thrown errors", () => {
    // A signed-out visitor sent to /login must never page anybody.
    assert.equal(isControlFlowError(Object.assign(new Error("x"), { digest: "NEXT_REDIRECT;replace;/login;307;" })), true);
    assert.equal(isControlFlowError(Object.assign(new Error("x"), { digest: "NEXT_NOT_FOUND" })), true);
    assert.equal(isControlFlowError(new Error("Connection terminated unexpectedly")), false);
  });

  it("reports nothing at all for control flow", async () => {
    const redirect = Object.assign(new Error("x"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    assert.deepEqual(
      await reportRequestError(redirect, { route: "/dashboard" }),
      { reported: false, alerted: false },
    );
  });

  it("reports a real failure even with no webhook configured", async () => {
    const result = await reportRequestError(new Error("Connection terminated"), { route: "/dashboard" });
    // Logged either way; "alerted" only says whether a channel took it.
    assert.deepEqual(result, { reported: true, alerted: false });
  });
});
