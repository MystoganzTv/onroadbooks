import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { getAuthStore, getRepository } from "../db";
import { requestPasswordReset, resetPassword, resetTokenHash } from "../auth/password-reset";
import { hashPassword, verifyPassword, encodeSession, sessionExpiry } from "../auth/session";
import { consumeLimit, saveReset, withSecurityLock, securityPool } from "../auth/security-store";
import { enforceAuthLimit, AuthRateLimitError } from "../auth/rate-limit";
import { getMobileSession } from "../auth/mobile";
import { syncStripeSubscription } from "../billing";
import type { User } from "../types";
let directory: string;
let owner: User;
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "onroad-security-"));
  process.env.ONROAD_DATA_DIR = directory;
  process.env.AUTH_SECRET = "security-tests-only-at-least-thirty-two-characters";
  process.env.DATA_SOURCE = process.env.ONROAD_TEST_BACKEND === "drizzle" ? "neon" : process.env.ONROAD_TEST_BACKEND === "prisma" ? "postgres" : "json";
  owner = await getAuthStore().createOwner({ email: `security-${randomUUID()}@example.test`, name: "Security test", businessName: "Disposable", passwordHash: await hashPassword("Old-password-2026"), plan: "OWNER" });
});
after(async () => { if (securityPool()) await securityPool()!.end(); await rm(directory, { recursive: true, force: true }); });

test("recovery tokens are single use, replace older links and revoke existing mobile sessions", async () => {
  const oldSession = await encodeSession({ userId: owner.id, businessId: owner.businessId, email: owner.email, exp: sessionExpiry() });
  const request = new Request("https://example.test", { headers: { authorization: `Bearer ${oldSession}` } });
  assert.ok(await getMobileSession(request));
  let first = ""; let second = "";
  await requestPasswordReset(owner.email, "en", async (_email, token) => { first = token; });
  await requestPasswordReset(owner.email, "en", async (_email, token) => { second = token; });
  assert.notEqual(first, second);
  assert.equal(await resetPassword(first, "Changed-password-2026"), false);
  const outcomes = await Promise.all([resetPassword(second, "Changed-password-2026"), resetPassword(second, "Changed-password-2026")]);
  assert.deepEqual(outcomes.sort(), [false, true]);
  const updated = await getAuthStore().findUserById(owner.id);
  assert.ok(updated);
  assert.equal(updated.authVersion, 1);
  assert.equal(await verifyPassword("Old-password-2026", updated.passwordHash), false);
  assert.equal(await verifyPassword("Changed-password-2026", updated.passwordHash), true);
  assert.equal(await getMobileSession(request), null);
  const fresh = await encodeSession({ userId: owner.id, businessId: owner.businessId, email: owner.email, authVersion: 1, exp: sessionExpiry() });
  assert.ok(await getMobileSession(new Request("https://example.test", { headers: { authorization: `Bearer ${fresh}` } })));
});
test("expired and malformed recovery links cannot change a password; unknown accounts send nothing", async () => {
  const token = "A".repeat(43);
  await saveReset(resetTokenHash(token), { userId: owner.id, authVersion: 1, expiresAt: Date.now() - 1000 });
  assert.equal(await resetPassword(token, "Changed-password-2026"), false);
  assert.equal(await resetPassword("malformed", "Changed-password-2026"), false);
  let sent = false;
  await requestPasswordReset("absent@example.test", "en", async () => { sent = true; });
  assert.equal(sent, false);
});
test("persistent limiter admits only its budget under concurrency and renews expired windows", async () => {
  const key = randomUUID();
  const attempts = await Promise.all(Array.from({ length: 20 }, () => consumeLimit(key, 5, 60_000)));
  assert.equal(attempts.filter(row => row.allowed).length, 5);
  assert.equal((await consumeLimit(key, 5, 60_000)).allowed, false);
  const short = randomUUID();
  await consumeLimit(short, 1, 1);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal((await consumeLimit(short, 1, 60_000)).allowed, true);
});
test("login limits normalize accounts and cannot be bypassed by rotating IPs", async () => {
  const email = `${randomUUID()}@example.test`;
  for (let i = 0; i < 10; i++) await enforceAuthLimit(new Request("https://example.test", { headers: { "x-forwarded-for": `192.0.2.${i + 1}` } }), "login", email);
  await assert.rejects(enforceAuthLimit(new Request("https://example.test", { headers: { "x-forwarded-for": "192.0.2.99" } }), "login", ` ${email.toUpperCase()} `), AuthRateLimitError);
});
test("workspace locks reject overlapping work and release after failure", async () => {
  let release!: () => void;
  let entered!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const held = withSecurityLock("test-lock", async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); });
  await ready;
  await assert.rejects(withSecurityLock("test-lock", async () => {}), /in progress/);
  release(); await held;
  await assert.rejects(withSecurityLock("test-lock", async () => { throw new Error("failure"); }), /failure/);
  assert.equal(await withSecurityLock("test-lock", async () => 42), 42);
});
test("late and repeated Stripe events re-read current state; old subscriptions cannot overwrite replacements", async () => {
  const subscription = (id: string, created: number, status: string) => ({ id, created, customer: "cus_security", status, metadata: { onRoadBusinessId: owner.businessId, onRoadPlan: "OWNER" }, items: { data: [{ price: { id: "price_security" }, current_period_end: 1893456000 }] } }) as unknown as Stripe.Subscription;
  const old = subscription("sub_security_old", 100, "active");
  const canceled = subscription(old.id, 100, "canceled");
  let reads = 0;
  await syncStripeSubscription(old, async () => { reads++; return canceled; });
  await syncStripeSubscription(old, async () => { reads++; return canceled; });
  assert.equal(reads, 2);
  assert.equal((await getRepository(owner.businessId).getDataset()).subscription.status, "CANCELED");
  const newer = subscription("sub_security_new", 200, "active");
  const retrieve = async (id: string) => id === old.id ? canceled : newer;
  await syncStripeSubscription(newer, retrieve);
  await syncStripeSubscription(old, retrieve);
  const current = (await getRepository(owner.businessId).getDataset()).subscription;
  assert.equal(current.providerSubscriptionId, newer.id);
  assert.equal(current.status, "ACTIVE");
  await assert.rejects(syncStripeSubscription(newer, async () => ({ ...newer, customer: "cus_other" })), /customer does not match/);
  await assert.rejects(syncStripeSubscription(newer, async () => { throw new Error("Stripe unavailable"); }), /Stripe unavailable/);
  assert.equal((await getRepository(owner.businessId).getDataset()).subscription.status, "ACTIVE");
  const replacement = subscription("sub_security_same_second", newer.created, "active");
  const previousCanceled = { ...newer, status: "canceled" as const };
  const sameSecond = async (id: string) => id === newer.id ? previousCanceled : replacement;
  await syncStripeSubscription(replacement, sameSecond);
  await syncStripeSubscription(newer, sameSecond);
  assert.equal((await getRepository(owner.businessId).getDataset()).subscription.providerSubscriptionId, replacement.id);
});

test("recovery email uses the trusted origin and a fragment token without exposing it in the API response", async (context) => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalUrl = process.env.AUTH_URL;
  process.env.RESEND_API_KEY = "fixture-no-network";
  process.env.AUTH_URL = "https://books.example.test";
  let payload: { to: string; text: string; subject: string } | undefined;
  context.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "https://api.resend.com/emails");
    payload = JSON.parse(String(options.body));
    return new Response(JSON.stringify({ id: "fixture-email" }), { status: 200 });
  });
  try {
    assert.equal(await requestPasswordReset(owner.email, "en"), undefined);
    assert.equal(payload?.to, owner.email);
    const link = payload?.text.match(/https:\/\/books\.example\.test\/reset-password#token=([A-Za-z0-9_-]{43})/);
    assert.ok(link);
    assert.match(payload!.text, /30 minutes/);
    assert.equal(await resetPassword(link[1], "Email-password-2026"), true);
  } finally {
    if (originalKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = originalKey;
    if (originalUrl === undefined) delete process.env.AUTH_URL; else process.env.AUTH_URL = originalUrl;
  }
});
