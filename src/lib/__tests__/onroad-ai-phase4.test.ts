import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import type Stripe from "stripe";

import type { MessageInterpreter } from "../onroad-ai/ai/provider";
import { DISABLED_INTERPRETER, DISABLED_TRANSCRIBER } from "../onroad-ai/ai/provider";
import { buildReport, evaluateHealth, maskWaId } from "../onroad-ai/monitoring";
import { DEFAULT_PLAN_CONFIG, effectivePlan, limitsFor, planConfigFromEnv, type BillingPort, type PlanConfig } from "../onroad-ai/plans";
import { drainSender, recordWebhook } from "../onroad-ai/processor";
import { DEFAULT_LIMITS, type BotDeps } from "../onroad-ai/router";
import { billingFromSubscription, syncOnroadAiSubscription } from "../onroad-ai/stripe-billing";
import { MemoryAssistantStore } from "../onroad-ai/store/memory";
import { freeBilling, type Billing } from "../onroad-ai/store/types";
import type { Button, WhatsAppClient } from "../onroad-ai/whatsapp/client";
import type { InboundMessage } from "../onroad-ai/whatsapp/payload";

class Recorder implements WhatsAppClient {
  sent: { to: string; body: string; buttons?: Button[] }[] = [];
  private n = 0;
  async sendText(to: string, body: string) {
    this.sent.push({ to, body });
    return { ok: true as const, messageId: `wamid.p4.${++this.n}` };
  }
  async sendButtons(to: string, body: string, buttons: Button[]) {
    this.sent.push({ to, body, buttons });
    return { ok: true as const, messageId: `wamid.p4.${++this.n}` };
  }
  async sendTemplate() {
    return { ok: true as const, messageId: `wamid.p4.${++this.n}` };
  }
  async markRead() {}
  async downloadMedia() {
    return { ok: false as const, reason: "NOT_FOUND" as const };
  }
  last(to: string) {
    return this.sent.filter((item) => item.to === to).at(-1)?.body ?? "";
  }
}

const pro = (status: string): Billing => ({ ...freeBilling(), plan: "PRO", status, stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", amountCents: 1_900 });
const config: PlanConfig = { ...DEFAULT_PLAN_CONFIG, billingEnabled: true, free: { messagesPerDay: 40, aiCallsPerDay: 1, transcriptionsPerDay: 1, maxAlerts: 1 } };

let store: MemoryAssistantStore;
let whatsapp: Recorder;
let clock: Date;
let seq = 0;
const checkouts: string[] = [];
const fakeBilling: BillingPort = {
  async checkoutUrl(user) {
    checkouts.push(user.id);
    return `https://checkout.stripe.test/c/${user.id}`;
  },
  async portalUrl(user) {
    return user.billing.stripeCustomerId ? `https://billing.stripe.test/p/${user.billing.stripeCustomerId}` : null;
  },
};
const usage = { provider: "test", model: "test", inputTokens: 1_000, outputTokens: 100, estimatedCostUsd: 0.0045 };
const unreadable: MessageInterpreter = { configured: true, async interpret() { return { ok: false, reason: "UNREADABLE", usage }; } };

function make(overrides: Partial<BotDeps> = {}): BotDeps {
  return { store, whatsapp, interpreter: DISABLED_INTERPRETER, transcriber: DISABLED_TRANSCRIBER, loadBoards: [], limits: { ...DEFAULT_LIMITS }, timeZone: "America/New_York", now: () => clock, ...overrides };
}

async function say(deps: BotDeps, from: string, text: string) {
  clock = new Date(clock.getTime() + 10_000);
  seq += 1;
  const message: InboundMessage = { id: `wamid.p4in.${seq}`, from, phoneNumberId: "PHONE", profileName: null, timestamp: Math.floor(clock.getTime() / 1000), kind: "text", text, media: null, replyId: null, rawType: "text" };
  await recordWebhook(store, { messages: [message], statuses: [] }, "PHONE");
  await drainSender(deps, from);
  return whatsapp.last(from);
}

beforeEach(() => {
  store = new MemoryAssistantStore();
  whatsapp = new Recorder();
  clock = new Date();
  checkouts.length = 0;
});

describe("plans", () => {
  it("everyone gets beta limits while billing is off", () => {
    assert.deepEqual(limitsFor(DEFAULT_PLAN_CONFIG, freeBilling()), DEFAULT_PLAN_CONFIG.beta);
    assert.deepEqual(limitsFor(DEFAULT_PLAN_CONFIG, pro("active")), DEFAULT_PLAN_CONFIG.beta);
  });
  it("PRO while active, trialing or past_due; FREE once Stripe gives up", () => {
    for (const status of ["active", "trialing", "past_due"]) assert.equal(effectivePlan(pro(status)), "PRO", status);
    for (const status of ["canceled", "unpaid", "incomplete", "incomplete_expired"]) assert.equal(effectivePlan(pro(status)), "FREE", status);
    assert.deepEqual(limitsFor(config, pro("active")), config.pro);
    assert.deepEqual(limitsFor(config, freeBilling()), config.free);
  });
  it("reads limits from env, ignoring blank values instead of turning them into 0", () => {
    const parsed = planConfigFromEnv({ STRIPE_SECRET_KEY: "sk_test", STRIPE_PRICE_ONROAD_AI_MONTHLY: "price_1", ONROAD_AI_FREE_AI_CALLS_PER_DAY: "7", ONROAD_AI_FREE_MESSAGES_PER_DAY: "", ONROAD_AI_MESSAGES_PER_DAY: "150" });
    assert.equal(parsed.billingEnabled, true);
    assert.equal(parsed.free.aiCallsPerDay, 7);
    assert.equal(parsed.free.messagesPerDay, DEFAULT_PLAN_CONFIG.free.messagesPerDay);
    assert.equal(parsed.beta.messagesPerDay, 150);
    assert.equal(planConfigFromEnv({ STRIPE_SECRET_KEY: "sk_test" }).billingEnabled, false);
  });
});

describe("plans over WhatsApp", () => {
  it("a FREE driver at the AI limit is told how to upgrade; typed loads still work", async () => {
    const deps = make({ plans: config, billing: fakeBilling, interpreter: unreadable });
    await say(deps, "15558000001", "hi");
    await say(deps, "15558000001", "skip");
    await say(deps, "15558000001", "some free text about a load");
    assert.match(await say(deps, "15558000001", "more free text"), /free reads[\s\S]*\*upgrade\*/);
    assert.match(await say(deps, "15558000001", "Chicago IL Miami FL 1400 miles $2800 120 DH"), /LOAD CONTRIBUTION/);
  });
  it("upgrade sends a Stripe checkout link; PRO gets the portal instead", async () => {
    const deps = make({ plans: config, billing: fakeBilling });
    await say(deps, "15558000002", "hi");
    await say(deps, "15558000002", "skip");
    assert.match(await say(deps, "15558000002", "upgrade"), /https:\/\/checkout\.stripe\.test\/c\/wau_/);
    assert.match(await say(deps, "15558000002", "manage subscription"), /don't have a subscription/);
    const user = (await store.findUserByWaId("15558000002"))!;
    await store.updateUser(user.id, { billing: pro("active") });
    assert.match(await say(deps, "15558000002", "upgrade"), /https:\/\/billing\.stripe\.test\/p\/cus_1/);
    assert.match(await say(deps, "15558000002", "plan"), /PRO \(active\)/);
    assert.equal(checkouts.length, 1);
  });
  it("without billing there is nothing to buy", async () => {
    const deps = make();
    await say(deps, "15558000003", "hola");
    await say(deps, "15558000003", "saltar");
    assert.match(await say(deps, "15558000003", "mejorar"), /no hay plan de pago/);
    assert.match(await say(deps, "15558000003", "plan"), /Acceso anticipado/);
  });
  it("a FREE driver gets the FREE number of alerts", async () => {
    const { MockLoadBoardProvider } = await import("../onroad-ai/loadboard/mock");
    const deps = make({ plans: config, billing: fakeBilling, loadBoards: [new MockLoadBoardProvider({ enabled: true, production: false })] });
    await say(deps, "15558000004", "hi");
    await say(deps, "15558000004", "skip");
    assert.match(await say(deps, "15558000004", "alert me loads toward VA"), /Alert saved/);
    assert.match(await say(deps, "15558000004", "alert me loads toward NC"), /already have 1 active alert/);
  });
});

describe("abuse controls", () => {
  it("a blocked number gets no reply and costs nothing", async () => {
    const deps = make();
    await say(deps, "15559000001", "hi");
    const user = (await store.findUserByWaId("15559000001"))!;
    await store.updateUser(user.id, { blockedAt: new Date(), blockedReason: "spam" });
    const before = whatsapp.sent.length;
    await say(deps, "15559000001", "hello?");
    assert.equal(whatsapp.sent.length, before);
    assert.ok([...store.events.values()].every((event) => event.status === "DONE"));
  });
  it("ignores first contacts from countries that are not allowed", async () => {
    const deps = make({ access: { allowedCountryCodes: ["1"], newUsersPerHour: 0 } });
    await say(deps, "525512345678", "hola");
    assert.equal(await store.findUserByWaId("525512345678"), null);
    assert.equal(whatsapp.sent.length, 0);
    await say(deps, "15559000002", "hi");
    assert.ok(await store.findUserByWaId("15559000002"));
  });
  it("caps brand-new numbers per hour", async () => {
    const deps = make({ access: { allowedCountryCodes: null, newUsersPerHour: 2 } });
    for (const n of [1, 2, 3]) await say(deps, `1555910000${n}`, "hi");
    assert.equal(store.users.size, 2);
  });
});

describe("cost accounting", () => {
  it("splits cost into AI, voice and WhatsApp, and the parts add up", async () => {
    const deps = make({ interpreter: unreadable });
    await say(deps, "15559200001", "hi");
    await say(deps, "15559200001", "skip");
    await say(deps, "15559200001", "free text here");
    const user = (await store.findUserByWaId("15559200001"))!;
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(clock);
    const row = await store.getUsage(user.id, day);
    assert.equal(row.aiCostMicros, 4_500);
    assert.equal(row.whatsappCostMicros, 3 * 3_400);
    assert.equal(row.costMicros, row.aiCostMicros + row.transcribeCostMicros + row.whatsappCostMicros);
  });
});

describe("Stripe sync", () => {
  const subscription = (overrides: Partial<Stripe.Subscription> = {}) =>
    ({
      id: "sub_1",
      status: "active",
      customer: "cus_1",
      metadata: { product: "onroad-ai", assistantUserId: "" },
      trial_end: null,
      items: { data: [{ price: { id: "price_ai", unit_amount: 1_900 }, current_period_end: 1_800_000_000 }] },
      ...overrides,
    }) as unknown as Stripe.Subscription;

  it("maps a subscription to the driver's billing", () => {
    assert.deepEqual(billingFromSubscription(subscription(), "price_ai"), {
      plan: "PRO",
      status: "active",
      currentPeriodEnd: new Date(1_800_000_000_000),
      amountCents: 1_900,
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
    });
    assert.equal(billingFromSubscription(subscription({ status: "canceled" }), "price_ai").plan, "FREE");
  });
  it("updates the right driver from metadata and ignores other products", async () => {
    const user = await store.createUser({ waId: "15559300001", displayName: null, profile: (await import("../onroad-ai/profile")).emptyProfile(), conversation: (await import("../onroad-ai/store/types")).emptyConversation() });
    const ours = subscription({ metadata: { product: "onroad-ai", assistantUserId: user.id } });
    const outcome = await syncOnroadAiSubscription(store, "sub_1", async () => ours);
    assert.equal(outcome.kind, "UPDATED");
    assert.equal((await store.getUserById(user.id))?.billing.plan, "PRO");
    const books = subscription({ metadata: { onRoadBusinessId: "biz_1" } });
    assert.deepEqual(await syncOnroadAiSubscription(store, "sub_2", async () => books), { kind: "IGNORED", reason: "not an OnRoad AI subscription" });
  });
  it("an old canceled subscription cannot downgrade a driver's newer one", async () => {
    const user = await store.createUser({ waId: "15559300002", displayName: null, profile: (await import("../onroad-ai/profile")).emptyProfile(), conversation: (await import("../onroad-ai/store/types")).emptyConversation() });
    await store.updateUser(user.id, { billing: { ...pro("active"), stripeSubscriptionId: "sub_new" } });
    const old = subscription({ id: "sub_old", status: "canceled", metadata: { product: "onroad-ai", assistantUserId: user.id } });
    const outcome = await syncOnroadAiSubscription(store, "sub_old", async () => old);
    assert.equal(outcome.kind, "IGNORED");
    assert.equal((await store.getUserById(user.id))?.billing.plan, "PRO");
  });
});

describe("monitoring and reporting", () => {
  const counts = { deadEvents: 0, failedEvents: 0, pendingEvents: 0, outboundSent: 100, outboundFailed: 0, newUsers: 0 };
  const settings = { dailyBudgetUsd: 5, fixedMonthlyCostUsd: 30 };

  it("flags dead messages, failing sends, backlog, budget and spikes -- and nothing when healthy", () => {
    assert.deepEqual(evaluateHealth(counts, 1, settings, 50), []);
    const kinds = evaluateHealth({ ...counts, deadEvents: 2, outboundFailed: 40, pendingEvents: 30, newUsers: 60 }, 9, settings, 50).map((issue) => issue.kind);
    assert.deepEqual(kinds, ["DEAD_EVENTS", "SEND_FAILURES", "BACKLOG", "OVER_BUDGET", "NEW_USER_SPIKE"]);
    assert.deepEqual(evaluateHealth({ ...counts, outboundSent: 3, outboundFailed: 3 }, 0, settings, 0), [], "too few sends to call it a rate");
  });
  it("zero-fills 30 days and nets revenue against variable and fixed cost", async () => {
    const user = await store.createUser({ waId: "15559400001", displayName: null, profile: (await import("../onroad-ai/profile")).emptyProfile(), conversation: (await import("../onroad-ai/store/types")).emptyConversation() });
    await store.addUsage(user.id, "2026-10-27", { messagesIn: 3, messagesOut: 3, costMicros: 2_000_000, aiCostMicros: 1_500_000, whatsappCostMicros: 500_000 });
    await store.updateUser(user.id, { billing: pro("active") });
    const report = await buildReport(store, "2026-10-27", settings);
    assert.equal(report.days.length, 30);
    assert.equal(report.days[0].day, "2026-09-28");
    assert.equal(report.days.at(-1)?.costMicros, 2_000_000);
    assert.equal(report.variableCostUsd, 2);
    assert.equal(report.fixedCostUsd, 30);
    assert.equal(report.revenueUsd, 19);
    assert.equal(report.marginUsd, 19 - 2 - 30);
    assert.equal(report.activeDrivers30d, 1);
  });
  it("masks phone numbers", () => {
    assert.equal(maskWaId("15551234567"), "+1 ••• 4567");
    assert.equal(maskWaId("525512345678"), "+52 ••• 5678");
  });
});
