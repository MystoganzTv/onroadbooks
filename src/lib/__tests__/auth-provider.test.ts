import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { allowLegacyWebSessions, sameOriginRequest } from "../auth/provider";
import { proxy } from "../../proxy";
import { NextRequest } from "next/server";
import { googleSignInConfigured } from "../auth/google-availability";
const saved = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env))
    if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});
it("Google availability follows the active provider without requiring a public client ID for Auth.js", () => {
  process.env.AUTH_PROVIDER = "authjs";
  delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  process.env.AUTH_GOOGLE_ID = "private-client-id";
  process.env.AUTH_GOOGLE_SECRET = "private-client-secret";
  assert.equal(googleSignInConfigured(), true);
  for (const missing of ["", "  ", "[SENSITIVE]"]) {
    process.env.AUTH_GOOGLE_SECRET = missing;
    assert.equal(googleSignInConfigured(), false);
  }
  process.env.AUTH_PROVIDER = "legacy";
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "legacy-client-id";
  assert.equal(googleSignInConfigured(), false);
  delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  assert.equal(googleSignInConfigured(), false);
});
it("legacy web compatibility expires at a fixed deadline and is disabled by default", () => {
  delete process.env.AUTH_LEGACY_SESSION_UNTIL;
  assert.equal(allowLegacyWebSessions(), false);
  process.env.AUTH_LEGACY_SESSION_UNTIL = "2026-09-20T00:00:00Z";
  assert.equal(
    allowLegacyWebSessions(Date.parse("2026-09-19T23:59:59Z")),
    true,
  );
  assert.equal(
    allowLegacyWebSessions(Date.parse("2026-09-20T00:00:00Z")),
    false,
  );
});
it("auth endpoints enforce the configured public origin behind a reverse proxy", () => {
  process.env.AUTH_URL = "https://onroadbooks.com";
  assert.equal(
    sameOriginRequest(
      new Request("http://localhost:3000/api/auth/login", {
        headers: { Origin: "https://onroadbooks.com" },
      }),
    ),
    true,
  );
  for (const origin of [
    "https://attacker.example",
    "http://onroadbooks.com",
    "https://onroadbooks.com.attacker.example",
    "null",
  ]) {
    assert.equal(
      sameOriginRequest(
        new Request("https://onroadbooks.com/api/auth/login", {
          headers: { Origin: origin },
        }),
      ),
      false,
    );
  }
  assert.equal(
    sameOriginRequest(
      new Request("https://onroadbooks.com/api/auth/login", {
        headers: { "Sec-Fetch-Site": "cross-site" },
      }),
    ),
    false,
  );
});
it("proxy accepts Auth.js chunked cookie presence only with the new provider enabled", () => {
  process.env.AUTH_PROVIDER = "authjs";
  const request = new NextRequest("https://onroadbooks.com/dashboard", {
    headers: { Cookie: "__Secure-authjs.session-token.0=encrypted-fragment" },
  });
  assert.equal(proxy(request).status, 200);
  process.env.AUTH_PROVIDER = "legacy";
  assert.equal(proxy(request).status, 307);
});
