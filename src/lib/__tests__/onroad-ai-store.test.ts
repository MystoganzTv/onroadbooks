import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "../../db/schema";
import { emptyFacts, mergeFacts } from "../onroad-ai/load-facts";
import { emptyProfile } from "../onroad-ai/profile";
import { DrizzleAssistantStore } from "../onroad-ai/store/drizzle";
import { MemoryAssistantStore } from "../onroad-ai/store/memory";
import { emptyConversation, type AssistantStore } from "../onroad-ai/store/types";

/**
 * One behavioural contract, two stores. The memory store runs everywhere;
 * the Drizzle store runs against the disposable PostgreSQL that
 * `npm run test:database` starts (ONROAD_DISPOSABLE_DATABASE=1).
 */

function contract(name: string, make: () => AssistantStore, options: { skip?: boolean } = {}) {
  describe(`AssistantStore contract: ${name}`, { skip: options.skip }, () => {
    let store: AssistantStore;
    const unique = () => `1555${Math.floor(Math.random() * 1e9)}`;
    before(() => {
      store = make();
    });

    it("records each wamid once and claims events oldest first, one at a time", async () => {
      const waId = unique();
      const event = (id: string, at: number) => ({ waMessageId: `${waId}.${id}`, waId, phoneNumberId: "P", messageType: "text", payload: { id }, sentAt: new Date(at) });
      assert.deepEqual(await store.recordInboundEvent(event("b", 2_000)), { inserted: true });
      assert.deepEqual(await store.recordInboundEvent(event("a", 1_000)), { inserted: true });
      assert.deepEqual(await store.recordInboundEvent(event("a", 1_000)), { inserted: false });
      const first = await store.claimNextEvent(waId, 3);
      assert.deepEqual(first?.payload, { id: "a" });
      assert.equal(first?.attempts, 1);
      await store.completeEvent(first!.id);
      const second = await store.claimNextEvent(waId, 3);
      assert.deepEqual(second?.payload, { id: "b" });
      await store.failEvent(second!.id, "boom", false);
      const retry = await store.claimNextEvent(waId, 3);
      assert.equal(retry?.attempts, 2);
      await store.failEvent(retry!.id, "boom", true);
      assert.equal(await store.claimNextEvent(waId, 3), null, "DEAD events are not claimed");
    });

    it("gives a sender's lease to one holder at a time", async () => {
      const waId = unique();
      assert.equal(await store.acquireLease(waId, "one", 60_000), true);
      assert.equal(await store.acquireLease(waId, "two", 60_000), false);
      await store.releaseLease(waId, "two");
      assert.equal(await store.acquireLease(waId, "two", 60_000), false, "only the holder can release");
      await store.releaseLease(waId, "one");
      assert.equal(await store.acquireLease(waId, "two", 60_000), true);
    });

    it("scopes every load to its owner", async () => {
      const a = await store.createUser({ waId: unique(), displayName: null, profile: emptyProfile(), conversation: emptyConversation() });
      const b = await store.createUser({ waId: unique(), displayName: null, profile: emptyProfile("es"), conversation: emptyConversation() });
      const facts = mergeFacts(emptyFacts(), { loadedMiles: 1_400, deadheadPickupMiles: 120, grossRate: 2_800 });
      const load = await store.createLoad(a.id, { userId: a.id, status: "ANALYZED", facts, lane: "X", grossRate: 2_800, totalMiles: 1_520, contribution: 1_363.88, contributionPerMile: 0.8973, rating: "MARGINAL", score: 69, decision: "NEGOTIATE", offers: [2_800] });
      assert.equal(load.contribution, 1_363.88);
      assert.equal(load.facts.loadedMiles, 1_400);
      assert.equal(await store.getLoad(b.id, load.id), null);
      assert.equal(await store.updateLoad(b.id, load.id, { status: "SAVED" }), null);
      assert.deepEqual(await store.listLoads(b.id, { limit: 10 }), []);
      const saved = await store.updateLoad(a.id, load.id, { status: "SAVED", offers: [2_800, 3_100] });
      assert.equal(saved?.status, "SAVED");
      assert.deepEqual(saved?.offers, [2_800, 3_100]);
      assert.equal((await store.listLoads(a.id, { status: "SAVED", limit: 10 })).length, 1);
    });

    it("round-trips profile and conversation, and adds usage atomically", async () => {
      const user = await store.createUser({ waId: unique(), displayName: "Ana", profile: emptyProfile(), conversation: emptyConversation() });
      const profile = { ...user.profile, mpg: 9.1, fuelPrice: 4.05, locale: "es" as const };
      const conversation = { ...user.conversation, onboardingStep: null, draft: mergeFacts(emptyFacts(), { loadedMiles: 10 }), awaiting: "deadheadPickupMiles" as const };
      await store.updateUser(user.id, { profile, conversation, lastInboundAt: new Date("2026-10-27T15:00:00Z") });
      const again = await store.findUserByWaId(user.waId);
      assert.equal(again?.profile.mpg, 9.1);
      assert.equal(again?.profile.locale, "es");
      assert.equal(again?.conversation.onboardingStep, null);
      assert.equal(again?.conversation.draft?.loadedMiles, 10);
      assert.equal(again?.conversation.awaiting, "deadheadPickupMiles");
      await store.addUsage(user.id, "2026-10-27", { messagesIn: 1, aiCalls: 1, costMicros: 6_000 });
      await store.addUsage(user.id, "2026-10-27", { messagesIn: 1, messagesOut: 2, costMicros: 6_800 });
      const usage = await store.getUsage(user.id, "2026-10-27");
      assert.equal(usage.messagesIn, 2);
      assert.equal(usage.messagesOut, 2);
      assert.equal(usage.costMicros, 12_800);
    });

    it("tracks delivery without moving a status backwards", async () => {
      const user = await store.createUser({ waId: unique(), displayName: null, profile: emptyProfile(), conversation: emptyConversation() });
      const id = `wamid.${unique()}`;
      await store.recordOutbound(user.id, { waMessageId: id, kind: "TEXT", status: "SENT", errorCode: null, errorTitle: null, length: 10 });
      await store.updateOutboundStatus(id, "READ", null, null);
      await store.updateOutboundStatus(id, "DELIVERED", null, null);
      const stats = await store.adminStats("2026-10-27");
      assert.ok((stats.outboundByStatus.READ ?? 0) >= 1);
    });

    it("deletes a driver completely", async () => {
      const user = await store.createUser({ waId: unique(), displayName: null, profile: emptyProfile(), conversation: emptyConversation() });
      await store.recordInboundEvent({ waMessageId: `del.${user.waId}`, waId: user.waId, phoneNumberId: "P", messageType: "text", payload: {}, sentAt: new Date() });
      await store.createLoad(user.id, { userId: user.id, status: "SAVED", facts: emptyFacts(), lane: null, grossRate: null, totalMiles: 0, contribution: null, contributionPerMile: null, rating: null, score: null, decision: null, offers: [] });
      await store.addUsage(user.id, "2026-10-27", { messagesIn: 1 });
      await store.deleteUser(user.id);
      assert.equal(await store.findUserByWaId(user.waId), null);
      assert.deepEqual(await store.listLoads(user.id, { limit: 5 }), []);
      assert.equal(await store.claimNextEvent(user.waId, 5), null);
      assert.equal((await store.getUsage(user.id, "2026-10-27")).messagesIn, 0);
    });

    it("keeps alerts per driver, dedupes matches and cascades on delete", async () => {
      const a = await store.createUser({ waId: unique(), displayName: null, profile: emptyProfile(), conversation: emptyConversation() });
      const b = await store.createUser({ waId: unique(), displayName: null, profile: emptyProfile(), conversation: emptyConversation() });
      const alert = await store.createAlert(a.id, { near: { city: "Chicago", state: "IL" }, radiusMiles: 100, towardState: null, minRatePerTotalMile: 2.2 });
      assert.deepEqual(alert.criteria, { near: { city: "Chicago", state: "IL" }, radiusMiles: 100, towardState: null, minRatePerTotalMile: 2.2 });
      assert.equal((await store.listAlerts(a.id, { activeOnly: true })).length, 1);
      assert.equal((await store.listAlerts(b.id, { activeOnly: false })).length, 0);
      assert.equal(await store.deactivateAlert(b.id, alert.id), false, "another driver cannot stop it");
      const due = await store.listDueAlerts(new Date(Date.now() + 1_000), 100);
      assert.ok(due.some((item) => item.id === alert.id));
      await store.markAlertChecked(alert.id, new Date());
      assert.ok(!(await store.listDueAlerts(new Date(Date.now() - 60_000), 100)).some((item) => item.id === alert.id));
      assert.deepEqual(await store.recordAlertMatch(a.id, alert.id, "mock", "L1"), { inserted: true });
      assert.deepEqual(await store.recordAlertMatch(a.id, alert.id, "mock", "L1"), { inserted: false });
      assert.equal(await store.hasAlertMatch(alert.id, "mock", "L1"), true);
      assert.equal(await store.countAlertMatchesSince(a.id, new Date(Date.now() - 60_000)), 1);
      await store.updateUser(a.id, { alertsOptInAt: new Date("2026-10-27T15:00:00Z") });
      assert.equal((await store.getUserById(a.id))?.alertsOptInAt?.toISOString(), "2026-10-27T15:00:00.000Z");
      assert.equal(await store.deactivateAllAlerts(a.id), 1);
      assert.equal((await store.listAlerts(a.id, { activeOnly: true })).length, 0);
      await store.deleteUser(a.id);
      assert.equal(await store.hasAlertMatch(alert.id, "mock", "L1"), false);
      assert.deepEqual(await store.listAlerts(a.id, { activeOnly: false }), []);
    });

    it("stores billing and blocks, and reports aggregates for the operator", async () => {
      const user = await store.createUser({ waId: unique(), displayName: "Op", profile: emptyProfile(), conversation: emptyConversation() });
      const sub = `sub_${unique()}`;
      const cus = `cus_${unique()}`;
      await store.updateUser(user.id, { billing: { plan: "PRO", status: "active", currentPeriodEnd: new Date("2026-11-27T00:00:00Z"), amountCents: 1_900, stripeCustomerId: cus, stripeSubscriptionId: sub } });
      assert.equal((await store.findUserByStripeSubscription(sub))?.id, user.id);
      assert.equal((await store.findUserByStripeCustomer(cus))?.billing.amountCents, 1_900);
      await store.updateUser(user.id, { blockedAt: new Date(), blockedReason: "spam" });
      assert.equal((await store.getUserById(user.id))?.blockedReason, "spam");

      await store.addUsage(user.id, "2026-10-26", { messagesIn: 2, messagesOut: 2, costMicros: 1_000, aiCostMicros: 600, whatsappCostMicros: 400 });
      await store.addUsage(user.id, "2026-10-27", { messagesIn: 1, costMicros: 10, whatsappCostMicros: 10 });
      const series = (await store.usageSeries("2026-10-26", "2026-10-27")).filter((day) => day.day >= "2026-10-26");
      const mine = series.find((day) => day.day === "2026-10-26")!;
      assert.ok(mine.aiCostMicros >= 600 && mine.whatsappCostMicros >= 400 && mine.activeUsers >= 1);

      const rows = await store.listUsersForAdmin({ limit: 500, since30d: new Date("2026-09-28T00:00:00Z"), day30: "2026-09-28" });
      const row = rows.find((item) => item.id === user.id)!;
      assert.equal(row.plan, "PRO");
      assert.equal(row.costMicros30d, 1_010);
      assert.equal(row.messagesIn30d, 3);
      assert.ok(row.blockedAt);

      const billing = await store.billingSummary();
      assert.ok(billing.proActive >= 1 && billing.mrrCents >= 1_900);
      const counts = await store.operationalCounts(new Date(Date.now() - 3_600_000));
      assert.ok(counts.newUsers >= 1);
    });

    it("retention clears old payloads but keeps the row", async () => {
      const waId = unique();
      await store.recordInboundEvent({ waMessageId: `ret.${waId}`, waId, phoneNumberId: "P", messageType: "text", payload: { text: "private" }, sentAt: new Date() });
      assert.ok((await store.purgeEventPayloads(new Date(Date.now() + 60_000))) >= 1);
      const event = await store.claimNextEvent(waId, 5);
      assert.equal(event?.payload, null);
    });
  });
}

contract("memory", () => new MemoryAssistantStore());

const disposable = process.env.ONROAD_DISPOSABLE_DATABASE === "1" && process.env.ONROAD_TEST_BACKEND === "drizzle" && Boolean(process.env.NEON_DATABASE_URL);
let pool: Pool | null = null;
contract(
  "drizzle (disposable PostgreSQL)",
  () => {
    pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL, max: 3 });
    return new DrizzleAssistantStore(drizzle(pool, { schema }));
  },
  { skip: !disposable },
);
after(async () => {
  await pool?.end();
});
