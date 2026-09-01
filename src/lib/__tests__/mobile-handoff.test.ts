import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Set before the modules below resolve it, so the suite never touches the
// generated secret file on a real machine.
process.env.AUTH_SECRET ||= "test-only-secret-for-the-handoff-suite";

import {
  challengeFor,
  decodeHandoffCode,
  encodeHandoffCode,
  isOpaqueToken,
  safeNextPath,
} from "../auth/mobile-handoff";
import { encodeSession } from "../auth/session";

const verifier = "Qm9iLXRoZS1idWlsZGVyLXZlcmlmaWVyLTEyMzQ1Ng";

function claims(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-1",
    businessId: "biz-1",
    email: "owner@example.com",
    challenge: challengeFor(verifier),
    exp: Math.floor(Date.now() / 1000) + 120,
    ...overrides,
  } as Parameters<typeof encodeHandoffCode>[0];
}

describe("the iOS sign-in handoff code", () => {
  it("round trips for the app that started the flow", async () => {
    const code = await encodeHandoffCode(claims());
    const decoded = await decodeHandoffCode(code, verifier);
    assert.equal(decoded?.userId, "user-1");
    assert.equal(decoded?.email, "owner@example.com");
  });

  it("is worthless to anyone without the verifier", async () => {
    // The whole reason a code travels through the custom scheme instead of a
    // session token: another app can catch the callback and still mint nothing.
    const code = await encodeHandoffCode(claims());
    assert.equal(await decodeHandoffCode(code, "some-other-verifier-entirely"), null);
    assert.equal(await decodeHandoffCode(code, ""), null);
  });

  it("refuses a tampered payload", async () => {
    const code = await encodeHandoffCode(claims());
    const [body, signature] = code.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), businessId: "biz-2" }),
    ).toString("base64url");
    assert.equal(await decodeHandoffCode(`${forged}.${signature}`, verifier), null);
  });

  it("expires", async () => {
    const code = await encodeHandoffCode(claims({ exp: Math.floor(Date.now() / 1000) - 1 }));
    assert.equal(await decodeHandoffCode(code, verifier), null);
  });

  it("is not a session, and a session is not one", async () => {
    // Same secret, different domain prefix. If these were interchangeable, a
    // two-minute handoff code would be a full session cookie.
    const session = await encodeSession({
      userId: "user-1",
      businessId: "biz-1",
      email: "owner@example.com",
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    assert.equal(await decodeHandoffCode(session, verifier), null);
  });
});

describe("where a sign-in may send the browser next", () => {
  it("accepts a path on this site", () => {
    assert.equal(
      safeNextPath("/api/auth/mobile-handoff?state=abc-123&challenge=x_y.z~w"),
      "/api/auth/mobile-handoff?state=abc-123&challenge=x_y.z~w",
    );
    assert.equal(safeNextPath("/dashboard"), "/dashboard");
  });

  it("refuses anything that could send a fresh session somewhere else", () => {
    assert.equal(safeNextPath("//evil.example.com"), null);
    assert.equal(safeNextPath("https://evil.example.com"), null);
    assert.equal(safeNextPath("/x\\evil"), null);
    assert.equal(safeNextPath("/x evil"), null);
    assert.equal(safeNextPath("dashboard"), null);
    assert.equal(safeNextPath(""), null);
    assert.equal(safeNextPath(undefined), null);
  });

  it("checks the shape of a state or a challenge before echoing it", () => {
    assert.equal(isOpaqueToken("a".repeat(43)), true);
    assert.equal(isOpaqueToken("too-short"), false);
    assert.equal(isOpaqueToken("has spaces in it and is long enough to pass"), false);
    assert.equal(isOpaqueToken(null), false);
  });
});
