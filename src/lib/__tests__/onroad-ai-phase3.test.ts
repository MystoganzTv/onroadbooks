import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { DISABLED_INTERPRETER, DISABLED_TRANSCRIBER } from "../onroad-ai/ai/provider";
import { alertLabel, parseAlertRequest, runAlerts, DEFAULT_ALERT_SETTINGS, type AlertSettings } from "../onroad-ai/alerts";
import { BOT_COPY } from "../onroad-ai/copy";
import { insights, summarize } from "../onroad-ai/history";
import { emptyFacts, mergeFacts } from "../onroad-ai/load-facts";
import { DatLoadBoardProvider } from "../onroad-ai/loadboard/dat";
import { MOCK_LOADS, MockLoadBoardProvider } from "../onroad-ai/loadboard/mock";
import { rankLoads } from "../onroad-ai/loadboard/search";
import { drainSender, recordWebhook } from "../onroad-ai/processor";
import { driverProfileSchema } from "../onroad-ai/profile";
import { DEFAULT_LIMITS, type BotDeps } from "../onroad-ai/router";
import { parseSettingsCommand } from "../onroad-ai/settings";
import { MemoryAssistantStore } from "../onroad-ai/store/memory";
import type { AssistantLoadRecord } from "../onroad-ai/store/types";
import type { Button, WhatsAppClient } from "../onroad-ai/whatsapp/client";
import type { InboundMessage } from "../onroad-ai/whatsapp/payload";

class Recorder implements WhatsAppClient {
  sent: { to: string; body: string; buttons?: Button[] }[] = [];
  templates: { to: string; name: string; language: string; params: string[] }[] = [];
  private n = 0;
  async sendText(to: string, body: string) {
    this.sent.push({ to, body });
    return { ok: true as const, messageId: `wamid.out.${++this.n}` };
  }
  async sendButtons(to: string, body: string, buttons: Button[]) {
    this.sent.push({ to, body, buttons });
    return { ok: true as const, messageId: `wamid.out.${++this.n}` };
  }
  async sendTemplate(to: string, name: string, language: string, params: string[]) {
    this.templates.push({ to, name, language, params });
    return { ok: true as const, messageId: `wamid.tpl.${++this.n}` };
  }
  async markRead() {}
  async downloadMedia() {
    return { ok: false as const, reason: "NOT_FOUND" as const };
  }
  last(to: string) {
    return this.sent.filter((item) => item.to === to).at(-1)?.body ?? "";
  }
}

const dat = () => new DatLoadBoardProvider({ enabled: false, clientId: null, clientSecret: null, commercialUseConfirmed: false });
const mock = () => new MockLoadBoardProvider({ enabled: true, production: false });

let store: MemoryAssistantStore;
let whatsapp: Recorder;
let deps: BotDeps;
let clock: Date;
let seq = 0;

function make(loadBoards = [dat(), mock()]): BotDeps {
  return { store, whatsapp, interpreter: DISABLED_INTERPRETER, transcriber: DISABLED_TRANSCRIBER, loadBoards, limits: { ...DEFAULT_LIMITS }, timeZone: "America/New_York", now: () => clock };
}

async function say(from: string, text: string) {
  clock = new Date(clock.getTime() + 10_000);
  seq += 1;
  const message: InboundMessage = { id: `wamid.p3.${seq}`, from, phoneNumberId: "PHONE", profileName: null, timestamp: Math.floor(clock.getTime() / 1000), kind: "text", text, media: null, replyId: null, rawType: "text" };
  await recordWebhook(store, { messages: [message], statuses: [] }, "PHONE");
  await drainSender(deps, from);
  return whatsapp.last(from);
}

async function driver(from: string) {
  await say(from, "hi");
  await say(from, "26 ft box truck");
  await say(from, "skip");
  const user = (await store.findUserByWaId(from))!;
  await store.updateUser(user.id, { profile: { ...user.profile, cargoCapacityLbs: 10_000 } });
  return user;
}

beforeEach(() => {
  store = new MemoryAssistantStore();
  whatsapp = new Recorder();
  clock = new Date();
  deps = make();
});

describe("search preferences", () => {
  const profile = driverProfileSchema.parse({ truckType: "BOX_TRUCK", truckLengthFt: 26, mpg: 8.5, fuelPrice: 6.7, dispatchValue: 5, factoringValue: 3.5, minRatePerTotalMile: 1.8 });

  it("parses states by code or name, and refuses cities", () => {
    assert.deepEqual(parseSettingsCommand("prefer destination VA NC", profile), { kind: "patch", patch: { preferredDestinations: ["VA", "NC"] }, keys: ["preferredDestinations"] });
    assert.deepEqual(parseSettingsCommand("destinos preferidos Virginia y North Carolina", profile), { kind: "patch", patch: { preferredDestinations: ["VA", "NC"] }, keys: ["preferredDestinations"] });
    assert.deepEqual(parseSettingsCommand("prefer origin chicago", profile), { kind: "invalid", key: "preferredOrigins" });
  });
  it("lists preferred lanes first, marked, then by contribution", () => {
    const plain = rankLoads(profile, MOCK_LOADS, null);
    const towardVa = rankLoads({ ...profile, preferredDestinations: ["VA"] }, MOCK_LOADS, null);
    assert.ok(plain.some((item) => item.load.facts.destination?.state !== "VA"));
    assert.deepEqual(towardVa.slice(0, 2).map((item) => item.load.facts.destination?.state), ["VA", "VA"]);
    assert.ok(towardVa[0].preferred && !towardVa[2].preferred);
    assert.ok(towardVa[0].analysis.estimate.contributionProfit >= towardVa[1].analysis.estimate.contributionProfit);
  });
  it("never shows broker details a provider is not licensed to show", () => {
    const restricted = MOCK_LOADS.map((load) => ({ ...load, brokerDisplayAllowed: false }));
    const ranked = rankLoads(profile, restricted, null);
    assert.ok(ranked.every((item) => item.load.facts.brokerCompany === null && item.load.facts.brokerContact === null));
  });
  it("a minimum RPM filter drops loads with no posted rate", () => {
    const noRate = [{ ...MOCK_LOADS[0], providerLoadId: "x", facts: { ...MOCK_LOADS[0].facts, grossRate: null } }];
    assert.deepEqual(rankLoads(profile, noRate, 2), []);
  });
  it("works over WhatsApp: set, search with ★, clear", async () => {
    await driver("15556000001");
    assert.match(await say("15556000001", "prefer destination VA"), /Preferred destinations updated[\s\S]*VA/);
    const results = await say("15556000001", "find loads near Chicago");
    assert.match(results, /^🧪 TEST DATA/);
    assert.match(results, /1\. ★ .*VA/);
    assert.match(results, /★ = your preferred states/);
    assert.match(await say("15556000001", "clear preferences"), /Preferences cleared/);
  });
});

describe("compare", () => {
  it("re-prices two history loads on today's profile and names the better one", async () => {
    await driver("15556000002");
    await say("15556000002", "Chicago IL Miami FL 1400 miles $3100 120 DH");
    await say("15556000002", "Chicago IL Richmond VA 820 miles $2050 35 DH");
    const reply = await say("15556000002", "compare 1 2");
    assert.match(reply, /Side by side — with your current settings/);
    assert.match(reply, /#1 Chicago, IL → Richmond, VA/);
    assert.match(reply, /Offer: \$2,050 \| \$3,100/);
    assert.match(reply, /Better per mile: #1/);
    assert.match(reply, /More contribution: #2/);
  });
  it("asks for two priced loads when there are not two", async () => {
    await driver("15556000003");
    await say("15556000003", "Chicago IL Miami FL 1400 miles $3100 120 DH");
    assert.match(await say("15556000003", "comparar"), /two priced loads|dos cargas/);
  });
});

describe("summary and suggestions", () => {
  const profile = driverProfileSchema.parse({ truckType: "BOX_TRUCK", mpg: 8.5, fuelPrice: 6.7, dispatchValue: 5, factoringValue: 3.5, minRatePerTotalMile: 1.8, deadheadWarnPct: 20 });
  const now = new Date("2026-10-27T15:00:00Z");
  let n = 0;
  const record = (over: Partial<AssistantLoadRecord> & { loaded?: number; dh?: number }): AssistantLoadRecord => {
    n += 1;
    const loaded = over.loaded ?? 1_000;
    const dh = over.dh ?? 50;
    return {
      id: `r${n}`,
      userId: "u",
      status: "ANALYZED",
      facts: mergeFacts(emptyFacts(), { loadedMiles: loaded, deadheadPickupMiles: dh }),
      lane: "Chicago, IL → Miami, FL",
      grossRate: 2_000,
      totalMiles: loaded + dh,
      contribution: 1_000,
      contributionPerMile: 1_000 / (loaded + dh),
      rating: "GOOD",
      score: 70,
      decision: "TAKE",
      offers: [2_000],
      createdAt: new Date(now.getTime() - 86_400_000),
      updatedAt: now,
      ...over,
    };
  };

  it("weights ratios by miles, not by load", () => {
    const summary = summarize(profile, [record({ grossRate: 3_000, contribution: 1_500, loaded: 1_450, dh: 50 }), record({ grossRate: 400, contribution: 300, loaded: 80, dh: 20 })], now);
    assert.equal(summary.totalMiles, 1_600);
    assert.equal(summary.realRpm, 3_400 / 1_600);
    assert.equal(summary.contributionPerMile, 1_800 / 1_600);
  });
  it("ignores loads older than 30 days and loads with no offer", () => {
    const summary = summarize(profile, [record({ createdAt: new Date(now.getTime() - 40 * 86_400_000) }), record({ grossRate: null, contribution: null })], now);
    assert.equal(summary.withOffer, 0);
    assert.equal(summary.analyzed, 1);
  });
  it("names a best lane only with at least two loads on it", () => {
    const one = summarize(profile, [record({ lane: "A → B" }), record({ lane: "C → D" })], now);
    assert.equal(one.bestLane, null);
    const two = summarize(profile, [record({ lane: "A → B" }), record({ lane: "A → B" }), record({ lane: "C → D" })], now);
    assert.equal(two.bestLane?.lane, "A → B");
  });
  it("refuses thin data for the deadhead pattern, and finds it with enough loads", () => {
    const thin = [record({ dh: 400, contribution: 500 }), record({ dh: 20 }), record({ dh: 20 })];
    assert.ok(!insights(profile, thin, now).some((item) => item.kind === "DEADHEAD_COST"));
    const enough = [...Array(3)].map(() => record({ dh: 400, contribution: 500 })).concat([...Array(3)].map(() => record({ dh: 20 })));
    const found = insights(profile, enough, now).find((item) => item.kind === "DEADHEAD_COST");
    assert.ok(found && found.kind === "DEADHEAD_COST" && found.difference > 0);
  });
  it("reports how much countering raised the rate", () => {
    const found = insights(profile, [record({ offers: [2_000, 2_300] }), record({ offers: [1_500, 1_600] })], now).find((item) => item.kind === "COUNTERS_WORK");
    assert.deepEqual(found, { kind: "COUNTERS_WORK", loads: 2, averageRaise: 200 });
  });
  it("renders over WhatsApp in Spanish", async () => {
    await say("15556000004", "hola");
    await say("15556000004", "saltar");
    await say("15556000004", "Chicago IL Miami FL 1400 millas $3100 120 DH");
    const reply = await say("15556000004", "resumen");
    assert.match(reply, /Tus últimos 30 días/);
    assert.match(reply, /1 carga revisada · 0 guardadas/);
  });
});

describe("load alerts", () => {
  const settings: AlertSettings = { ...DEFAULT_ALERT_SETTINGS, intervalMinutes: 60 };

  it("parses the spec's example", () => {
    assert.deepEqual(parseAlertRequest("Notify me when a load above $2.20/total mile appears within 100 miles of Chicago IL"), {
      kind: "CRITERIA",
      criteria: { near: { city: "Chicago", state: "IL" }, radiusMiles: 100, towardState: null, minRatePerTotalMile: 2.2 },
    });
    const es = parseAlertRequest("avísame cargas de más de $2.20/mi a 100 millas de Chicago IL");
    assert.equal(es?.kind === "CRITERIA" && es.criteria.near?.state, "IL", "Spanish 'de' is not Delaware");
    assert.deepEqual(parseAlertRequest("alert me good loads"), { kind: "NEEDS_PLACE" });
    assert.equal(parseAlertRequest("Chicago IL Miami FL 1400 miles $2800 120 DH"), null);
  });

  it("refuses to save an alert without an authorized provider", async () => {
    deps = make([dat()]);
    await driver("15557000001");
    assert.match(await say("15557000001", "alert me loads above $2.20/mi within 100 miles of Chicago IL"), /none is connected yet/);
    assert.equal(store.alerts.size, 0);
    const result = await runAlerts(deps, settings);
    assert.equal(result.skippedNoProvider, true);
  });

  it("records the opt-in, sends matches inside the window, never twice", async () => {
    const user = await driver("15557000002");
    assert.match(await say("15557000002", "alert me loads above $2.20/mi within 100 miles of Chicago IL"), /Alert saved: within 100 mi of Chicago, IL, above \$2\.20\/total mi/);
    assert.ok((await store.getUserById(user.id))?.alertsOptInAt);

    const first = await runAlerts(deps, settings);
    assert.deepEqual([first.sent, first.loadsSent], [1, 2]);
    const message = whatsapp.last("15557000002");
    assert.match(message, /^🧪 TEST DATA/);
    assert.match(message, /New loads for your alert/);
    assert.doesNotMatch(message, /Atlanta|Norfolk|Dallas|Columbus/, "below $2.20, over 100 mi DH, a 53 ft van, or outside IL");
    assert.match(message, /Reply \*STOP\*/);

    clock = new Date(clock.getTime() + 2 * 3_600_000);
    const second = await runAlerts(deps, settings);
    assert.equal(second.sent, 0, "same loads are not sent again");

    // "1" prices the first alerted load.
    assert.match(await say("15557000002", "1"), /FINAL DECISION/);
  });

  it("respects the check interval", async () => {
    await driver("15557000003");
    await say("15557000003", "alert me loads toward VA");
    await runAlerts(deps, settings);
    clock = new Date(clock.getTime() + 10 * 60_000);
    assert.equal((await runAlerts(deps, settings)).checked, 0);
  });

  it("outside 24 hours: holds without a template, uses the approved template when configured", async () => {
    await driver("15557000004");
    await say("15557000004", "alert me loads toward VA");
    clock = new Date(clock.getTime() + 25 * 3_600_000);
    const held = await runAlerts(deps, settings);
    assert.equal(held.heldForWindow, 1);
    assert.equal(store.alertMatches.length, 0, "held loads are not marked as delivered");
    assert.equal(whatsapp.templates.length, 0);

    clock = new Date(clock.getTime() + 2 * 3_600_000);
    const withTemplate = await runAlerts(deps, { ...settings, template: { name: "load_alert", languages: { en: "en_US", es: "es" } } });
    assert.equal(withTemplate.sent, 1);
    assert.deepEqual(whatsapp.templates[0], { to: "15557000004", name: "load_alert", language: "en_US", params: ["2", "toward VA"] });
  });

  it("caps loads per driver per day", async () => {
    await driver("15557000005");
    await say("15557000005", "alert me loads toward VA");
    const capped = await runAlerts(deps, { ...settings, perUserPerDay: 1 });
    assert.equal(capped.loadsSent, 1);
    clock = new Date(clock.getTime() + 2 * 3_600_000);
    assert.equal((await runAlerts(deps, { ...settings, perUserPerDay: 1 })).capped, 1);
  });

  it("list, stop one, STOP all -- and nothing is sent after STOP", async () => {
    await driver("15557000006");
    await say("15557000006", "alert me loads toward VA");
    await say("15557000006", "alert me loads near Chicago IL");
    assert.match(await say("15557000006", "my alerts"), /1\. toward VA\n2\. near Chicago, IL/);
    assert.match(await say("15557000006", "stop alert 2"), /Alert 2 stopped/);
    assert.match(await say("15557000006", "STOP"), /All alerts stopped \(1\)/);
    const result = await runAlerts(deps, settings);
    assert.equal(result.sent, 0);
    assert.ok((await store.findUserByWaId("15557000006"))?.alertsOptOutAt);
  });

  it("limits active alerts per driver", async () => {
    await driver("15557000007");
    for (const state of ["VA", "NC", "GA"]) await say("15557000007", `alert me loads toward ${state}`);
    assert.match(await say("15557000007", "alert me loads toward SC"), /already have 3 active alerts/);
  });

  it("deleting a driver deletes their alerts", async () => {
    const user = await driver("15557000008");
    await say("15557000008", "alert me loads toward VA");
    await runAlerts(deps, settings);
    await store.deleteUser(user.id);
    assert.equal(store.alerts.size, 0);
    assert.equal(store.alertMatches.length, 0);
  });

  it("labels alerts in both languages", () => {
    const criteria = { near: { city: "Chicago", state: "IL" }, radiusMiles: 100, towardState: "VA", minRatePerTotalMile: 2.2 };
    assert.equal(alertLabel(criteria, BOT_COPY.en), "within 100 mi of Chicago, IL, toward VA, above $2.20/total mi");
    assert.equal(alertLabel(criteria, BOT_COPY.es), "a 100 mi de Chicago, IL, hacia VA, más de $2.20/milla total");
  });
});
