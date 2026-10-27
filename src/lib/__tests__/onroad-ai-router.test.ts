import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import type { InterpretInput, MessageInterpreter, Transcriber } from "../onroad-ai/ai/provider";
import { DISABLED_INTERPRETER, DISABLED_TRANSCRIBER } from "../onroad-ai/ai/provider";
import { DatLoadBoardProvider } from "../onroad-ai/loadboard/dat";
import { LoadBoardUnavailableError } from "../onroad-ai/loadboard/provider";
import { MockLoadBoardProvider } from "../onroad-ai/loadboard/mock";
import { drainSender, recordWebhook, sweepPending } from "../onroad-ai/processor";
import { DEFAULT_LIMITS, type BotDeps } from "../onroad-ai/router";
import { MemoryAssistantStore } from "../onroad-ai/store/memory";
import { CloudApiClient, isWithinServiceWindow, type Button, type WhatsAppClient } from "../onroad-ai/whatsapp/client";
import { parseWebhook, type InboundMessage } from "../onroad-ai/whatsapp/payload";
import { signForTest, verifyMetaSignature, verifySubscription } from "../onroad-ai/whatsapp/signature";

interface Sent {
  to: string;
  body: string;
  buttons?: Button[];
}

class Recorder implements WhatsAppClient {
  sent: Sent[] = [];
  failNext: { code: number; retryable: boolean } | null = null;
  media = new Map<string, { bytes: Buffer; mimeType: string }>();
  private n = 0;
  async sendText(to: string, body: string) {
    return this.record({ to, body });
  }
  async sendButtons(to: string, body: string, buttons: Button[]) {
    return this.record({ to, body, buttons });
  }
  templates: { to: string; name: string; language: string; params: string[] }[] = [];
  async sendTemplate(to: string, name: string, language: string, params: string[]) {
    this.templates.push({ to, name, language, params });
    return { ok: true as const, messageId: `wamid.tpl.${++this.n}` };
  }
  private record(message: Sent) {
    if (this.failNext) {
      const failure = this.failNext;
      this.failNext = null;
      return { ok: false as const, code: failure.code, title: "test failure", retryable: failure.retryable, windowClosed: failure.code === 131047 };
    }
    this.sent.push(message);
    return { ok: true as const, messageId: `wamid.out.${++this.n}` };
  }
  async markRead() {}
  async downloadMedia(id: string) {
    const file = this.media.get(id);
    return file ? { ok: true as const, ...file } : { ok: false as const, reason: "NOT_FOUND" as const };
  }
  last(to?: string) {
    const list = to ? this.sent.filter((item) => item.to === to) : this.sent;
    return list[list.length - 1]?.body ?? "";
  }
}

let store: MemoryAssistantStore;
let whatsapp: Recorder;
let deps: BotDeps;
let clock: Date;
let seq = 0;

function makeDeps(overrides: Partial<BotDeps> = {}): BotDeps {
  return {
    store,
    whatsapp,
    interpreter: DISABLED_INTERPRETER,
    transcriber: DISABLED_TRANSCRIBER,
    loadBoards: [new DatLoadBoardProvider({ enabled: false, clientId: null, clientSecret: null, commercialUseConfirmed: false })],
    limits: { ...DEFAULT_LIMITS },
    timeZone: "America/New_York",
    now: () => clock,
    ...overrides,
  };
}

function message(from: string, text: string, overrides: Partial<InboundMessage> = {}): InboundMessage {
  seq += 1;
  return {
    id: `wamid.in.${seq}`,
    from,
    phoneNumberId: "PHONE",
    profileName: "Driver",
    timestamp: Math.floor(clock.getTime() / 1000),
    kind: "text",
    text,
    media: null,
    replyId: null,
    rawType: "text",
    ...overrides,
  };
}

async function say(from: string, text: string, overrides: Partial<InboundMessage> = {}) {
  // A human pace, so the burst limiter only fires where a test asks for it.
  clock = new Date(clock.getTime() + 10_000);
  await recordWebhook(store, { messages: [message(from, text, overrides)], statuses: [] }, "PHONE");
  await drainSender(deps, from);
  return whatsapp.last(from);
}

async function onboard(from: string, answers: string[]) {
  await say(from, "hi");
  for (const answer of answers) await say(from, answer);
}

beforeEach(() => {
  store = new MemoryAssistantStore();
  whatsapp = new Recorder();
  clock = new Date("2026-10-27T15:00:00Z");
  deps = makeDeps();
});

describe("webhook security", () => {
  it("verifies the HMAC over the raw body with the app secret", () => {
    const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
    assert.equal(verifyMetaSignature(body, signForTest(body, "secret"), "secret"), true);
    assert.equal(verifyMetaSignature(body, signForTest(body, "other"), "secret"), false);
    assert.equal(verifyMetaSignature(`${body} `, signForTest(body, "secret"), "secret"), false);
    assert.equal(verifyMetaSignature(body, null, "secret"), false);
    assert.equal(verifyMetaSignature(body, "sha256=zz", "secret"), false);
  });
  it("echoes the challenge only for the right verify token", () => {
    const params = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "a-long-verify-token", "hub.challenge": "42" });
    assert.equal(verifySubscription(params, "a-long-verify-token"), "42");
    assert.equal(verifySubscription(params, "a-different-token!!"), null);
    assert.equal(verifySubscription(params, ""), null);
  });
  it("parses Meta's payload into messages and statuses", () => {
    const parsed = parseWebhook({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: {
        metadata: { phone_number_id: "PHONE" },
        contacts: [{ wa_id: "15551110000", profile: { name: "Ana" } }],
        messages: [
          { id: "wamid.A", from: "15551110000", timestamp: "1793112000", type: "text", text: { body: "hola" } },
          { id: "wamid.B", from: "15551110000", timestamp: "1793112001", type: "audio", audio: { id: "MEDIA1", mime_type: "audio/ogg; codecs=opus", voice: true } },
          { id: "wamid.C", from: "15551110000", timestamp: "1793112002", type: "sticker", sticker: { id: "x" } },
        ],
        statuses: [{ id: "wamid.out.1", recipient_id: "15551110000", status: "failed", timestamp: "1793112003", errors: [{ code: 131047, title: "Re-engagement message" }] }],
      } }] }],
    });
    assert.equal(parsed?.messages.length, 3);
    assert.equal(parsed?.messages[0].profileName, "Ana");
    assert.equal(parsed?.messages[1].kind, "audio");
    assert.equal(parsed?.messages[2].kind, "unsupported");
    assert.equal(parsed?.statuses[0].errorCode, 131047);
    assert.equal(parseWebhook({ object: "page", entry: [] }), null);
  });
});

describe("onboarding and profiles", () => {
  it("welcomes a new number and asks one question at a time", async () => {
    const first = await say("15550000001", "hello");
    assert.match(first, /Welcome to OnRoad AI\. Let's set up your truck\./);
    assert.match(first, /1\/5/);
    assert.match(await say("15550000001", "26 ft box truck"), /2\/5/);
    assert.match(await say("15550000001", "ok"), /3\/5/);
    assert.match(await say("15550000001", "4.10"), /4\/5/);
    assert.match(await say("15550000001", "0"), /5\/5/);
    assert.match(await say("15550000001", "6 3.5"), /You're set/);
    const user = await store.findUserByWaId("15550000001");
    assert.equal(user?.profile.mpg, 8.5);
    assert.equal(user?.profile.fuelPrice, 4.1);
    assert.equal(user?.profile.minRatePerTotalMile, 0);
    assert.equal(user?.profile.dispatchValue, 6);
    assert.equal(user?.conversation.onboardingStep, null);
  });
  it("detects Spanish and switches language on request", async () => {
    assert.match(await say("15550000002", "hola, quiero calcular una carga"), /Bienvenido/);
    assert.match(await say("15550000002", "english"), /Language set to English/);
  });
  it("re-asks instead of guessing an answer it cannot read", async () => {
    await say("15550000003", "hi");
    assert.match(await say("15550000003", "a big one"), /didn't catch that[\s\S]*1\/5/);
    assert.match(await say("15550000003", "Chicago IL Miami FL 1400 miles $2800 120 DH"), /finish setting up/);
  });
  it("SKIP accepts the offered suggestions for the remaining steps", async () => {
    await say("15550000004", "hi");
    await say("15550000004", "cargo van");
    assert.match(await say("15550000004", "skip"), /You're set/);
    const user = await store.findUserByWaId("15550000004");
    assert.equal(user?.profile.truckType, "CARGO_VAN");
    assert.equal(user?.profile.mpg, 8.5);
  });
});

describe("load analysis over WhatsApp", () => {
  beforeEach(async () => {
    await onboard("15551000000", ["26 ft box truck", "8.5", "6.70", "1.80", "5 3.5"]);
  });

  it("prices a shorthand load and offers buttons when it fits", async () => {
    await say("15551000000", "Chicago IL Miami FL 1400 miles $2800 120 DH");
    const reply = whatsapp.sent[whatsapp.sent.length - 1];
    assert.match(reply.body, /LOAD CONTRIBUTION: \$1,363\.88/);
    assert.match(reply.body, /FINAL DECISION: NEGOTIATE/);
    if (reply.body.length <= 1_024) assert.equal(reply.buttons?.length, 3);
    else assert.match(reply.body, /Reply \*1\* broker message/);
  });
  it("asks one follow-up for a missing value, then finishes the same load", async () => {
    assert.match(await say("15551000000", "Chicago IL Miami FL 1400 miles $2800"), /EMPTY to the pickup/);
    assert.match(await say("15551000000", "120"), /TOTAL: 1,520 mi/);
    const loads = await store.listLoads((await store.findUserByWaId("15551000000"))!.id, { limit: 10 });
    assert.equal(loads.length, 1);
  });
  it("re-checks the current load when the broker changes the offer", async () => {
    await say("15551000000", "Chicago IL Miami FL 1400 miles $2800 120 DH");
    assert.match(await say("15551000000", "Broker offered $3100, should I take it?"), /OFFER: \*\$3,100\*[\s\S]*TAKE/);
    const user = (await store.findUserByWaId("15551000000"))!;
    const [load] = await store.listLoads(user.id, { limit: 5 });
    assert.deepEqual(load.offers, [2_800, 3_100]);
  });
  it("recalculates the current saved load for the deadhead corrections from the WhatsApp trial without AI", async () => {
    await say("15551000000", "Elmsford NY Monroeville PA 375 millas $800 0 DH");
    await say("15551000000", "save");
    const before = (await store.findUserByWaId("15551000000"))!;
    for (const [input, dh] of [["dh 40 millas", 40], ["40 dh", 40], ["dh 50", 50], ["dead head 50", 50], ["dh 0", 0]] as const) {
      assert.match(await say("15551000000", input), new RegExp(`TOTAL: ${375 + dh} mi`), input);
      const user = (await store.findUserByWaId("15551000000"))!;
      assert.equal(user.conversation.currentLoadId, before.conversation.currentLoadId);
      const loads = await store.listLoads(user.id, { limit: 10 });
      assert.equal(loads.length, 1);
      assert.equal(loads[0].status, "SAVED");
      assert.equal(loads[0].facts.deadheadPickupMiles, dh);
      assert.equal(loads[0].facts.loadedMiles, 375);
      assert.equal(loads[0].facts.origin?.city, "Elmsford");
      assert.equal(loads[0].facts.destination?.city, "Monroeville");
      assert.deepEqual(loads[0].offers, [800]);
    }
    assert.equal((await store.getUsage(before.id, "2026-10-27")).aiCalls, 0);
  });
  it("accepts a labelled deadhead answer when asking for missing pickup miles", async () => {
    await say("15551000000", "Elmsford NY Monroeville PA 375 millas $800");
    assert.match(await say("15551000000", "dh 50"), /TOTAL: 425 mi/);
    const user = (await store.findUserByWaId("15551000000"))!;
    assert.equal(user.conversation.awaiting, null);
    assert.equal((await store.listLoads(user.id, { limit: 10 })).length, 1);
  });
  it("keeps labelled deadhead separate from a pending rate and an explicit return leg", async () => {
    await say("15551000000", "Elmsford NY Monroeville PA 375 millas 0 DH");
    await say("15551000000", "50 dh");
    let user = (await store.findUserByWaId("15551000000"))!;
    assert.equal(user.conversation.awaiting, "grossRate");
    assert.equal(user.conversation.draft?.grossRate, null);
    assert.equal(user.conversation.draft?.deadheadPickupMiles, 50);
    await say("15551000000", "$800");
    assert.match(await say("15551000000", "dh after 25"), /TOTAL: 450 mi/);
    user = (await store.findUserByWaId("15551000000"))!;
    assert.equal(user.conversation.draft?.deadheadPickupMiles, 50);
    assert.equal(user.conversation.draft?.deadheadAfterMiles, 25);
  });
  it("what to ask, broker message, save and history", async () => {
    await say("15551000000", "Chicago IL Miami FL 1400 miles $2500 120 DH");
    assert.match(await say("15551000000", "what should I ask?"), /ASK: \$[\d,]+[\s\S]*WALK AWAY/);
    await say("15551000000", "1");
    assert.match(whatsapp.last("15551000000"), /^Hi,\nFollowing up on the Chicago, IL to Miami, FL load/);
    assert.match(await say("15551000000", "save"), /Saved: Chicago, IL → Miami, FL/);
    assert.match(await say("15551000000", "history"), /💾 Chicago, IL → Miami, FL · \$2,500/);
  });
  it("a settings change re-prices the load on the table", async () => {
    await say("15551000000", "Chicago IL Miami FL 1400 miles $2800 120 DH");
    const reply = await say("15551000000", "mpg 10");
    assert.match(reply, /Updated: MPG/);
    assert.match(reply, /Fuel: -\$1,018\.40/);
  });
  it("tells the driver live search is unavailable without an authorized provider", async () => {
    assert.match(await say("15551000000", "find loads near Chicago for my 26 ft box truck"), /isn't connected yet/);
  });
  it("labels mock search results as TEST DATA and lets the driver price one", async () => {
    deps = makeDeps({ loadBoards: [new MockLoadBoardProvider({ enabled: true, production: false })] });
    const reply = await say("15551000000", "find loads near Chicago");
    assert.match(reply, /TEST DATA/);
    assert.doesNotMatch(reply, /Dallas, TX/, "a 53 ft dry van load must never be offered to a box truck");
    assert.match(await say("15551000000", "1"), /FINAL DECISION/);
  });
  it("without an AI key it explains the format instead of guessing", async () => {
    assert.match(await say("15551000000", "got a load from dallas going to houston, decent pay"), /Send it in this format/);
    assert.match(await say("15551000000", "voice", { kind: "audio", text: null, media: { id: "M1", mimeType: "audio/ogg", filename: null, voice: true } }), /can't listen to voice notes yet/);
  });
});

describe("AI paths with substitutes for the providers", () => {
  const interpreter = (reply: (input: InterpretInput) => Awaited<ReturnType<MessageInterpreter["interpret"]>>): MessageInterpreter => ({
    configured: true,
    async interpret(input) {
      return reply(input);
    },
  });
  const usage = { provider: "test", model: "test", inputTokens: 1_000, outputTokens: 200, estimatedCostUsd: 0.006 };

  beforeEach(async () => {
    await onboard("15552000000", ["26 ft box truck", "8.5", "6.70", "1.80", "5 3.5"]);
  });

  it("keeps the current load when a text correction repeats its lane but omits unchanged miles", async () => {
    await say("15552000000", "Elmsford NY Monroeville PA 375 miles $800 50 DH");
    await say("15552000000", "save");
    const before = (await store.findUserByWaId("15552000000"))!;
    deps = makeDeps({ interpreter: interpreter(() => ({
      ok: true, usage,
      interpretation: { intent: "LOAD", language: "en", search: null, loads: [{
        ...emptyLoad(), origin: { city: "Elmsford", state: "NY" },
        destination: { city: "Monroeville", state: "PA" },
        deadheadPickupMiles: 60, grossRate: 850,
      }] },
    })) });
    assert.match(await say("15552000000", "Now sixty empty miles to pickup and eight hundred fifty dollars total"), /TOTAL: 435 mi/);
    const after = (await store.findUserByWaId("15552000000"))!;
    assert.equal(after.conversation.currentLoadId, before.conversation.currentLoadId);
    const loads = await store.listLoads(after.id, { limit: 10 });
    assert.equal(loads.length, 1);
    assert.equal(loads[0].status, "SAVED");
    assert.equal(loads[0].facts.loadedMiles, 375);
    assert.deepEqual(loads[0].offers, [800, 850]);
  });

  it("does not inherit mileage when a text message names a different lane", async () => {
    await say("15552000000", "Elmsford NY Monroeville PA 375 miles $800 50 DH");
    deps = makeDeps({ interpreter: interpreter(() => ({
      ok: true, usage,
      interpretation: { intent: "LOAD", language: "en", search: null, loads: [{
        ...emptyLoad(), origin: { city: "Dallas", state: "TX" }, deadheadPickupMiles: 60, grossRate: 850,
      }] },
    })) });
    assert.match(await say("15552000000", "Another pickup in Dallas"), /How many LOADED miles/);
    const user = (await store.findUserByWaId("15552000000"))!;
    assert.equal(user.conversation.draft?.loadedMiles, null);
    assert.equal(user.conversation.draft?.destination, null);
  });

  it("prices a screenshot read and marks it as read from the image", async () => {
    whatsapp.media.set("IMG1", { bytes: Buffer.from("fake"), mimeType: "image/jpeg" });
    deps = makeDeps({
      interpreter: interpreter(() => ({
        ok: true,
        usage,
        interpretation: {
          intent: "LOAD",
          language: "en",
          search: null,
          loads: [{ ...emptyLoad(), origin: { city: "Chicago", state: "IL" }, destination: { city: "Miami", state: "FL" }, loadedMiles: 1_400, deadheadPickupMiles: 120, grossRate: 2_800, source: "IMAGE" }],
        },
      })),
    });
    const reply = await say("15552000000", "", { kind: "image", text: null, media: { id: "IMG1", mimeType: "image/jpeg", filename: null, voice: false } });
    assert.match(reply, /Read from your screenshot/);
    assert.match(reply, /LOAD CONTRIBUTION: \$1,363\.88/);
    const user = (await store.findUserByWaId("15552000000"))!;
    const today = await store.getUsage(user.id, "2026-10-27");
    assert.equal(today.aiCalls, 1);
    assert.equal(today.costMicros > 6_000, true);
  });
  it("an extraction failure becomes a plain message, never a made-up load", async () => {
    whatsapp.media.set("IMG2", { bytes: Buffer.from("fake"), mimeType: "image/png" });
    deps = makeDeps({ interpreter: interpreter(() => ({ ok: false, reason: "UNREADABLE", usage })) });
    const reply = await say("15552000000", "", { kind: "image", text: null, media: { id: "IMG2", mimeType: "image/png", filename: null, voice: false } });
    assert.match(reply, /couldn't find load details/);
    assert.equal((await store.listLoads((await store.findUserByWaId("15552000000"))!.id, { limit: 5 })).length, 0);
  });
  it("a voice note is transcribed, shown back, then priced", async () => {
    whatsapp.media.set("VOICE1", { bytes: Buffer.alloc(8_000), mimeType: "audio/ogg" });
    const transcriber: Transcriber = {
      configured: true,
      async transcribe() {
        return { ok: true, text: "Chicago IL Miami FL 1400 miles $2800 120 DH", usage: { ...usage, audioSeconds: 6, estimatedCostUsd: 0.0003 } };
      },
    };
    deps = makeDeps({ transcriber });
    const reply = await say("15552000000", "", { kind: "audio", text: null, media: { id: "VOICE1", mimeType: "audio/ogg", filename: null, voice: true } });
    assert.match(reply, /^🎙️ I heard: “Chicago IL Miami FL 1400 miles \$2800 120 DH”/);
    assert.match(reply, /LOAD CONTRIBUTION/);
  });
  it("several loads in one screenshot -> asks which one", async () => {
    whatsapp.media.set("IMG3", { bytes: Buffer.from("fake"), mimeType: "image/jpeg" });
    deps = makeDeps({
      interpreter: interpreter(() => ({
        ok: true,
        usage,
        interpretation: {
          intent: "LOAD",
          language: "en",
          search: null,
          loads: [
            { ...emptyLoad(), origin: { city: "Gary", state: "IN" }, loadedMiles: 330, deadheadPickupMiles: 30, grossRate: 900, source: "IMAGE" },
            { ...emptyLoad(), origin: { city: "Joliet", state: "IL" }, loadedMiles: 715, deadheadPickupMiles: 48, grossRate: 1_450, source: "IMAGE" },
          ],
        },
      })),
    });
    assert.match(await say("15552000000", "", { kind: "image", text: null, media: { id: "IMG3", mimeType: "image/jpeg", filename: null, voice: false } }), /I see 2 loads/);
    assert.match(await say("15552000000", "2"), /LOADED: 715 mi/);
  });
  it("stops calling the model once the daily AI quota is used", async () => {
    let calls = 0;
    deps = makeDeps({ limits: { ...DEFAULT_LIMITS, aiCallsPerDay: 1 }, interpreter: interpreter(() => { calls += 1; return { ok: false, reason: "UNREADABLE", usage }; }) });
    await say("15552000000", "some free text about a load");
    assert.match(await say("15552000000", "more free text"), /today's limit/);
    assert.equal(calls, 1);
    // Deterministic paths keep working.
    assert.match(await say("15552000000", "Chicago IL Miami FL 1400 miles $2800 120 DH"), /LOAD CONTRIBUTION/);
  });
});

function emptyLoad() {
  return {
    origin: null, destination: null, loadedMiles: null, deadheadPickupMiles: null, deadheadAfterMiles: null, grossRate: null,
    pickupDate: null, deliveryDate: null, weightLbs: null, equipment: null, equipmentLengthFt: null, loadKind: null, extraStops: null,
    liftgateRequired: null, palletJackRequired: null, tolls: null, otherCosts: null, brokerCompany: null, brokerContact: null,
    brokerMc: null, brokerPhone: null, brokerEmail: null, reference: null, commodity: null, specialInstructions: null, source: "TEXT" as const,
  };
}

describe("multiple drivers", () => {
  it("each driver is priced with their own truck, and never sees another's data", async () => {
    await onboard("15553000001", ["26 ft box truck", "8.5", "6.70", "1.80", "5 3.5"]);
    await onboard("15553000002", ["cargo van", "18", "4.00", "0", "0 0"]);
    const a = await say("15553000001", "Chicago IL Miami FL 1400 miles $2800 120 DH");
    const b = await say("15553000002", "Chicago IL Miami FL 1400 miles $2800 120 DH");
    assert.match(a, /Fuel: -\$1,198\.12/);
    assert.match(b, /Fuel: -\$337\.78/);
    assert.notEqual(a, b);
    await say("15553000001", "save");
    assert.match(await say("15553000002", "history"), /Chicago/);
    const one = (await store.findUserByWaId("15553000001"))!;
    const two = (await store.findUserByWaId("15553000002"))!;
    const loadOfOne = (await store.listLoads(one.id, { limit: 1 }))[0];
    assert.equal(await store.getLoad(two.id, loadOfOne.id), null, "a driver cannot read another driver's load by id");
    assert.equal(await store.updateLoad(two.id, loadOfOne.id, { status: "SAVED" }), null);
    const historyOfTwo = await store.listLoads(two.id, { limit: 10 });
    assert.ok(historyOfTwo.every((load) => load.userId === two.id));
  });
  it("delete my data erases only that driver", async () => {
    await onboard("15554000001", ["ok", "ok", "ok", "ok", "ok"]);
    await onboard("15554000002", ["ok", "ok", "ok", "ok", "ok"]);
    await say("15554000001", "Chicago IL Miami FL 1400 miles $2800 120 DH");
    assert.match(await say("15554000001", "delete my data"), /Reply \*DELETE\*/);
    assert.match(await say("15554000001", "DELETE"), /Your data is deleted/);
    assert.equal(await store.findUserByWaId("15554000001"), null);
    assert.ok(![...store.loads.values()].some((load) => load.facts.loadedMiles === 1_400));
    assert.ok(![...store.events.values()].some((event) => event.waId === "15554000001"));
    assert.ok(await store.findUserByWaId("15554000002"));
  });
});

describe("delivery, retries and limits", () => {
  it("a redelivered webhook is recorded and answered once", async () => {
    const one = message("15555000000", "hi");
    const first = await recordWebhook(store, { messages: [one], statuses: [] }, "PHONE");
    const again = await recordWebhook(store, { messages: [one], statuses: [] }, "PHONE");
    assert.deepEqual(first, { senders: ["15555000000"], duplicates: 0, ignored: 0 });
    assert.deepEqual(again, { senders: [], duplicates: 1, ignored: 0 });
    await drainSender(deps, "15555000000");
    await drainSender(deps, "15555000000");
    assert.equal(whatsapp.sent.length, 1);
  });
  it("ignores messages addressed to another business number", async () => {
    const result = await recordWebhook(store, { messages: [{ ...message("15555000001", "hi"), phoneNumberId: "OTHER" }], statuses: [] }, "PHONE");
    assert.equal(result.ignored, 1);
  });
  it("retries a transient WhatsApp failure and then answers", async () => {
    whatsapp.failNext = { code: 130429, retryable: true };
    await recordWebhook(store, { messages: [message("15555000002", "hi")], statuses: [] }, "PHONE");
    await drainSender(deps, "15555000002");
    assert.equal(whatsapp.sent.length, 0);
    assert.equal([...store.events.values()][0].status, "FAILED");
    // The memory store stamps receivedAt with the real clock.
    clock = new Date(Date.now() + 120_000);
    const sweep = await sweepPending(deps);
    assert.equal(sweep.processed, 1);
    assert.match(whatsapp.last("15555000002"), /Welcome/);
  });
  it("records a permanent failure without retrying", async () => {
    await onboard("15555000003", ["ok", "ok", "ok", "ok", "ok"]);
    whatsapp.failNext = { code: 131026, retryable: false };
    await say("15555000003", "help");
    assert.ok(store.outbound.some((row) => row.status === "FAILED" && row.errorCode === 131026));
    assert.equal([...store.events.values()].every((event) => event.status === "DONE"), true);
  });
  it("delivery statuses update the outbound log and never move backwards", async () => {
    await say("15555000004", "hi");
    const id = store.outbound[0].waMessageId!;
    await recordWebhook(store, { messages: [], statuses: [{ messageId: id, recipient: "15555000004", status: "read", timestamp: 0, errorCode: null, errorTitle: null, pricingCategory: "service", billable: true }] }, "PHONE");
    assert.equal(store.outbound[0].status, "READ");
  });
  it("never sends free-form text outside the 24-hour window", async () => {
    await recordWebhook(store, { messages: [message("15555000005", "hi")], statuses: [] }, "PHONE");
    clock = new Date(clock.getTime() + 25 * 3_600_000);
    await drainSender(deps, "15555000005");
    assert.equal(whatsapp.sent.length, 0);
    assert.equal(store.outbound[0].status, "WINDOW_CLOSED");
    assert.equal(isWithinServiceWindow(new Date("2026-10-27T15:00:00Z"), new Date("2026-10-28T14:59:00Z")), true);
  });
  it("throttles a burst and says so once", async () => {
    deps = makeDeps({ limits: { ...DEFAULT_LIMITS, burstPerMinute: 3 } });
    await onboard("15555000006", ["ok", "ok", "ok", "ok", "ok"]);
    clock = new Date(clock.getTime() + 61_000);
    const burst = async () => {
      await recordWebhook(store, { messages: [message("15555000006", "help")], statuses: [] }, "PHONE");
      await drainSender(deps, "15555000006");
      return whatsapp.last("15555000006");
    };
    for (let index = 0; index < 3; index += 1) await burst();
    assert.match(await burst(), /faster than I can price/);
    const before = whatsapp.sent.length;
    await burst();
    assert.equal(whatsapp.sent.length, before, "silence after the one notice");
  });
});

describe("load board providers", () => {
  it("DAT stays unavailable without credentials, permission AND an implementation", async () => {
    const off = new DatLoadBoardProvider({ enabled: false, clientId: null, clientSecret: null, commercialUseConfirmed: false });
    assert.deepEqual(off.status(), { available: false, reason: "NOT_CONFIGURED" });
    const unlicensed = new DatLoadBoardProvider({ enabled: true, clientId: "id", clientSecret: "secret", commercialUseConfirmed: false });
    assert.deepEqual(unlicensed.status(), { available: false, reason: "NOT_AUTHORIZED" });
    const ready = new DatLoadBoardProvider({ enabled: true, clientId: "id", clientSecret: "secret", commercialUseConfirmed: true });
    assert.deepEqual(ready.status(), { available: false, reason: "NOT_IMPLEMENTED" });
    await assert.rejects(ready.searchLoads({ near: null, radiusMiles: null, towardState: null, pickupDate: null, equipment: [], maxDeadheadMiles: null, limit: 5 }), LoadBoardUnavailableError);
  });
  it("the mock board refuses to run in production", () => {
    assert.deepEqual(new MockLoadBoardProvider({ enabled: true, production: true }).status(), { available: false, reason: "DISABLED_IN_PRODUCTION" });
  });
});

describe("WhatsApp Cloud API client", () => {
  const client = (responses: (() => Response)[]) => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const next = responses.shift();
      if (!next) throw new Error("no more responses");
      return next();
    }) as unknown as typeof fetch;
    return { calls, api: new CloudApiClient({ accessToken: "SECRET-TOKEN", phoneNumberId: "PHONE", graphVersion: "v24.0", fetchImpl, sleep: async () => {} }) };
  };
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) => () => new Response(JSON.stringify(body), { status, headers });

  it("sends text and returns the wamid", async () => {
    const { api, calls } = client([json(200, { messages: [{ id: "wamid.X" }] })]);
    assert.deepEqual(await api.sendText("1555", "hi"), { ok: true, messageId: "wamid.X" });
    assert.equal(calls[0].url, "https://graph.facebook.com/v24.0/PHONE/messages");
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), { messaging_product: "whatsapp", recipient_type: "individual", to: "1555", type: "text", text: { preview_url: false, body: "hi" } });
  });
  it("retries 429 and 5xx, then succeeds", async () => {
    const { api, calls } = client([json(429, { error: { code: 130429, message: "rate" } }), json(503, {}), json(200, { messages: [{ id: "wamid.Y" }] })]);
    assert.deepEqual(await api.sendText("1555", "hi"), { ok: true, messageId: "wamid.Y" });
    assert.equal(calls.length, 3);
  });
  it("does not retry a closed 24-hour window and never leaks the token", async () => {
    const { api, calls } = client([json(400, { error: { code: 131047, message: "Re-engagement message" } })]);
    const result = await api.sendText("1555", "hi");
    assert.equal(calls.length, 1);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.windowClosed, true);
      assert.equal(result.retryable, false);
      assert.doesNotMatch(JSON.stringify(result), /SECRET-TOKEN/);
    }
  });
  it("trims buttons to WhatsApp's limits", async () => {
    const { api, calls } = client([json(200, { messages: [{ id: "wamid.Z" }] })]);
    await api.sendButtons("1555", "body", [{ id: "a", title: "A very long button title here" }, { id: "b", title: "b" }, { id: "c", title: "c" }, { id: "d", title: "d" }]);
    const sent = JSON.parse(String(calls[0].init.body));
    assert.equal(sent.interactive.action.buttons.length, 3);
    assert.equal(sent.interactive.action.buttons[0].reply.title.length, 20);
  });
  it("refuses media over the size limit", async () => {
    const { api } = client([json(200, { url: "https://lookaside.example/x", mime_type: "image/jpeg", file_size: 9_000_000 })]);
    assert.deepEqual(await api.downloadMedia("M1", 4_000_000), { ok: false, reason: "TOO_LARGE" });
  });
});
