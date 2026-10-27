/**
 * MESSAGE ROUTER
 * ==============
 *
 * One inbound WhatsApp message in, at most a couple of replies out.
 *
 * Order of precedence (first match wins):
 *   1. new number              -> create profile, start onboarding
 *   2. limits                  -> burst and daily quotas
 *   3. pending "delete my data" confirmation
 *   4. language switch
 *   5. onboarding answer       (until the five questions are done)
 *   6. deterministic commands  settings, help, save, history, broker
 *                              message, what to ask, search, shortcuts
 *   7. answer to a question we asked ("120" after "how many DH miles?")
 *   8. quick shorthand parse   "Chicago IL Miami FL 1400 miles $2800 120 DH"
 *   9. AI interpretation       free text, screenshots, PDFs, voice notes
 *
 * Steps 1-8 are free and deterministic. Only 9 spends money, and only when
 * a key is configured and the driver is inside their daily AI quota.
 *
 * The router never computes money: it calls `analyzeLoad`, which calls the
 * OnRoad Books calculation engine. It never books, accepts or contacts.
 */

import { roundMoney } from "../calculations";
import type { InterpretContext, MessageInterpreter, Transcriber, AiUsage } from "./ai/provider";
import type { Interpretation, SearchCriteria } from "./ai/schema";
import { analyzeLoad, type FreightAnalysis } from "./analyze";
import { brokerMessage } from "./broker-message";
import { copyFor, type BotCopy } from "./copy";
import { alertLabel, availableProvider, MAX_ALERTS_PER_USER, parseAlertRequest } from "./alerts";
import { effectivePlan, limitsFor, type BillingPort, type PlanConfig, type PlanLimits } from "./plans";
import { contributionPerMileForDisplay, renderAnalysis, renderComparison, renderNegotiation, renderProfile, renderProfileShort, renderShortlist, renderSummary, truckLabel, clampForWhatsApp, WHATSAPP_INTERACTIVE_BODY_LIMIT } from "./format";
import { compareLoads, insights, summarize } from "./history";
import { emptyFacts, laneLabel, mergeFacts, type CriticalField, type LoadFacts } from "./load-facts";
import type { LoadBoardProvider } from "./loadboard/provider";
import { searchLoads } from "./loadboard/search";
import { miles, money, perMile } from "./numbers";
import { emptyProfile, missingProfileFields, STARTER_PROFILE, type BotLocale, type DriverProfile } from "./profile";
import { parseBareNumber, quickIntent, type QuickIntent } from "./quick-parse";
import { isAffirmative, isSkip, languageCommand, normalize, parseFees, parseNumber, parseSettingsCommand, parseTruck } from "./settings";
import { emptyConversation, type AssistantStore, type AssistantUser, type ConversationState, type OnboardingStep, type UsageDelta } from "./store/types";
import { isWithinServiceWindow, type Button, type WhatsAppClient } from "./whatsapp/client";
import type { InboundMessage } from "./whatsapp/payload";

import { DEFAULT_LIMITS, type Limits } from "./router-limits";
export { DEFAULT_LIMITS, type Limits };

export interface BotDeps {
  store: AssistantStore;
  whatsapp: WhatsAppClient;
  interpreter: MessageInterpreter;
  transcriber: Transcriber;
  loadBoards: LoadBoardProvider[];
  limits: Limits;
  timeZone: string;
  now: () => Date;
  /** Plan quotas. Absent = everyone on `limits` (billing off). */
  plans?: PlanConfig;
  /** Stripe checkout / portal links. Absent or null = billing off. */
  billing?: BillingPort | null;
  /** Who may start a conversation at all. Absent = anyone. */
  access?: AccessPolicy;
}

export interface AccessPolicy {
  /** Country calling codes allowed to onboard, e.g. ["1"] for US/Canada. Null = all. */
  allowedCountryCodes: string[] | null;
  /** New drivers per rolling hour before first contacts are ignored (spam/cost guard). */
  newUsersPerHour: number;
}

export function planLimits(deps: BotDeps, billing: AssistantUser["billing"]): PlanLimits {
  const config: PlanConfig = deps.plans ?? {
    billingEnabled: false,
    free: { messagesPerDay: deps.limits.messagesPerDay, aiCallsPerDay: deps.limits.aiCallsPerDay, transcriptionsPerDay: deps.limits.transcriptionsPerDay, maxAlerts: MAX_ALERTS_PER_USER },
    pro: { messagesPerDay: deps.limits.messagesPerDay, aiCallsPerDay: deps.limits.aiCallsPerDay, transcriptionsPerDay: deps.limits.transcriptionsPerDay, maxAlerts: MAX_ALERTS_PER_USER },
    beta: { messagesPerDay: deps.limits.messagesPerDay, aiCallsPerDay: deps.limits.aiCallsPerDay, transcriptionsPerDay: deps.limits.transcriptionsPerDay, maxAlerts: MAX_ALERTS_PER_USER },
  };
  return limitsFor(config, billing);
}

function billingOn(deps: BotDeps): boolean {
  return Boolean(deps.plans?.billingEnabled && deps.billing);
}

export interface Reply {
  text: string;
  buttons?: Button[];
  /** Typed fallback appended when buttons cannot be sent. */
  fallback?: string;
}

type OkAnalysis = Extract<FreightAnalysis, { status: "OK" }>;

const SHORTCUT_IDS = { "1": "act:broker", "2": "act:save", "3": "act:ask" } as const;

export function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Cheap language guess for the very first message only. */
export function detectLocale(text: string | null): BotLocale {
  if (!text) return "en";
  const clean = normalize(text);
  return /\b(hola|buenas|buenos|carga|cargas|millas|vacio|cuanto|quiero|ofrecen|ofrece|espanol|gracias|camion|ayuda|tarifa|dias)\b/.test(clean) ? "es" : "en";
}

const micros = (usd: number) => Math.round(usd * 1_000_000);

interface Ctx {
  deps: BotDeps;
  user: AssistantUser;
  profile: DriverProfile;
  state: ConversationState;
  copy: BotCopy;
  usage: UsageDelta;
  /** Prepended to the next reply (e.g. "I heard: ..."). */
  preface: string | null;
}

function addUsage(ctx: Ctx, delta: UsageDelta) {
  for (const [key, value] of Object.entries(delta) as [keyof UsageDelta, number][]) {
    ctx.usage[key] = (ctx.usage[key] ?? 0) + value;
  }
}

function recordAi(ctx: Ctx, usage: AiUsage | undefined, kind: "interpret" | "transcribe") {
  if (!usage) return;
  addUsage(ctx, {
    aiCalls: kind === "interpret" ? 1 : 0,
    transcriptions: kind === "transcribe" ? 1 : 0,
    aiInputTokens: usage.inputTokens,
    aiOutputTokens: usage.outputTokens,
    audioSeconds: usage.audioSeconds ?? 0,
    costMicros: micros(usage.estimatedCostUsd),
    ...(kind === "interpret" ? { aiCostMicros: micros(usage.estimatedCostUsd) } : { transcribeCostMicros: micros(usage.estimatedCostUsd) }),
  });
}

function withPreface(ctx: Ctx, replies: Reply[]): Reply[] {
  if (!ctx.preface || !replies.length) return replies;
  const [first, ...rest] = replies;
  const preface = ctx.preface;
  ctx.preface = null;
  return [{ ...first, text: `${preface}\n\n${first.text}` }, ...rest];
}

/* -- onboarding ------------------------------------------------------------ */

const STEPS: OnboardingStep[] = ["TRUCK", "MPG", "FUEL", "MIN_RPM", "FEES"];

function stepQuestion(step: OnboardingStep, copy: BotCopy, withHint: boolean): string {
  const s = copy.suggestion;
  const starter = STARTER_PROFILE;
  const question = {
    TRUCK: copy.askTruck(s(`${starter.truckLengthFt} ft ${copy.equipment[starter.truckType]}`)),
    MPG: copy.askMpg(s(`${starter.mpg} MPG`)),
    FUEL: copy.askFuel(s(`${perMile(starter.fuelPrice)}/gal`)),
    MIN_RPM: copy.askMinRpm(s(`${perMile(starter.minRatePerTotalMile)}/total mi`)),
    FEES: copy.askFees(s(`${starter.dispatchValue}% / ${starter.factoringValue}%`)),
  }[step];
  return withHint ? `${question}\n\n${copy.skipHint}` : question;
}

function applyStarter(profile: DriverProfile, step: OnboardingStep): DriverProfile {
  const s = STARTER_PROFILE;
  switch (step) {
    case "TRUCK": return { ...profile, truckType: s.truckType, truckLengthFt: s.truckLengthFt };
    case "MPG": return { ...profile, mpg: s.mpg };
    case "FUEL": return { ...profile, fuelPrice: s.fuelPrice };
    case "MIN_RPM": return { ...profile, minRatePerTotalMile: s.minRatePerTotalMile };
    case "FEES": return { ...profile, dispatchMode: s.dispatchMode, dispatchValue: s.dispatchValue, factoringMode: s.factoringMode, factoringValue: s.factoringValue };
  }
}

function applyAnswer(profile: DriverProfile, step: OnboardingStep, text: string): DriverProfile | null {
  if (isAffirmative(text)) return applyStarter(profile, step);
  const value = parseNumber(normalize(text).replace(/\s*(mpg|\/gal|gal|per gallon|el galon|\/mi|per mile|por milla|usd)\s*$/g, ""));
  switch (step) {
    case "TRUCK": {
      const truck = parseTruck(text);
      return truck ? { ...profile, ...truck } : null;
    }
    case "MPG": return value !== null && value >= 3 && value <= 40 ? { ...profile, mpg: value } : null;
    case "FUEL": return value !== null && value >= 1 && value <= 20 ? { ...profile, fuelPrice: value } : null;
    case "MIN_RPM": return value !== null && value >= 0 && value <= 20 ? { ...profile, minRatePerTotalMile: value } : null;
    case "FEES": {
      const fees = parseFees(text);
      return fees ? { ...profile, ...fees } : null;
    }
  }
}

function onboarding(ctx: Ctx, text: string | null): Reply[] {
  const step = ctx.state.onboardingStep!;
  if (text === null) return [{ text: `${ctx.copy.finishSetupFirst}\n\n${stepQuestion(step, ctx.copy, false)}` }];

  if (isSkip(text)) {
    let profile = ctx.profile;
    for (const remaining of STEPS.slice(STEPS.indexOf(step))) {
      profile = applyStarter(profile, remaining);
    }
    ctx.profile = profile;
    ctx.state.onboardingStep = null;
    return [{ text: ctx.copy.onboardingDone(renderProfileShort(ctx.profile, ctx.profile.locale)) }];
  }

  const next = applyAnswer(ctx.profile, step, text);
  if (!next) {
    const looksLikeLoad = quickIntent(text)?.kind === "LOAD";
    return [{ text: `${looksLikeLoad ? ctx.copy.finishSetupFirst : ctx.copy.didNotUnderstand}\n\n${stepQuestion(step, ctx.copy, true)}` }];
  }
  ctx.profile = next;
  const following = STEPS[STEPS.indexOf(step) + 1] ?? null;
  ctx.state.onboardingStep = following;
  if (following) return [{ text: stepQuestion(following, ctx.copy, false) }];
  return [{ text: ctx.copy.onboardingDone(renderProfileShort(ctx.profile, ctx.profile.locale)) }];
}

/* -- load evaluation ------------------------------------------------------- */

function askFor(field: CriticalField, copy: BotCopy): string {
  return { loadedMiles: copy.askLoadedMiles, deadheadPickupMiles: copy.askDeadhead, grossRate: copy.askGrossRate }[field];
}

function analysisReply(ctx: Ctx, analysis: OkAnalysis): Reply {
  const text = clampForWhatsApp(renderAnalysis(analysis, ctx.profile.locale));
  return {
    text,
    buttons: [
      { id: SHORTCUT_IDS["1"], title: ctx.copy.buttons.brokerMessage },
      { id: SHORTCUT_IDS["2"], title: ctx.copy.buttons.save },
      { id: SHORTCUT_IDS["3"], title: ctx.copy.buttons.whatToAsk },
    ],
    fallback: ctx.copy.footerShortcuts,
  };
}

/**
 * Price the working draft. `mode: "update"` keeps the same history row (a
 * new offer for the same load); "new" starts a new one.
 */
async function evaluate(ctx: Ctx, mode: "new" | "update"): Promise<Reply[]> {
  const draft = ctx.state.draft ?? emptyFacts();
  const missingProfile = missingProfileFields(ctx.profile);
  if (missingProfile.length) {
    return [{ text: ctx.copy.profileIncomplete(missingProfile.map((field) => ctx.copy.fields[field]).join(", ")) }];
  }
  const analysis = analyzeLoad(ctx.profile, draft, { needOffer: ctx.state.wantsOffer });
  if (analysis.status === "NEEDS_PROFILE") {
    return [{ text: ctx.copy.profileIncomplete(analysis.missingProfile.map((field) => ctx.copy.fields[field]).join(", ")) }];
  }
  if (analysis.status === "NEEDS_INFO") {
    ctx.state.awaiting = analysis.missing[0];
    const source = draft.source === "IMAGE" ? ctx.copy.fromScreenshot : draft.source === "PDF" ? ctx.copy.fromDocument : null;
    const lane = laneLabel(draft);
    const head = [source, lane ? `🚛 ${lane}` : null].filter(Boolean).join("\n");
    return [{ text: `${head ? `${head}\n\n` : ""}${askFor(analysis.missing[0], ctx.copy)}` }];
  }

  ctx.state.awaiting = null;
  ctx.state.shortcutsLive = true;
  const e = analysis.estimate;
  const record = {
    status: "ANALYZED" as const,
    facts: draft,
    lane: laneLabel(draft),
    grossRate: draft.grossRate,
    totalMiles: e.totalMiles,
    contribution: analysis.hasOffer ? e.contributionProfit : null,
    // The figure the driver saw next to the rating, so history never shows $0.90 beside MARGINAL.
    contributionPerMile: analysis.hasOffer ? contributionPerMileForDisplay(analysis) : null,
    rating: analysis.hasOffer ? e.score.rating : null,
    score: analysis.hasOffer ? e.score.score : null,
    decision: analysis.decision,
  };
  const existing = mode === "update" && ctx.state.currentLoadId ? await ctx.deps.store.getLoad(ctx.user.id, ctx.state.currentLoadId) : null;
  if (existing) {
    const offers = draft.grossRate !== null && existing.offers[existing.offers.length - 1] !== draft.grossRate ? [...existing.offers, draft.grossRate] : existing.offers;
    await ctx.deps.store.updateLoad(ctx.user.id, existing.id, { ...record, status: existing.status, offers });
  } else {
    const created = await ctx.deps.store.createLoad(ctx.user.id, { ...record, userId: ctx.user.id, offers: draft.grossRate !== null ? [draft.grossRate] : [] });
    ctx.state.currentLoadId = created.id;
  }
  return [analysisReply(ctx, analysis)];
}

function startNewLoad(ctx: Ctx, facts: Partial<LoadFacts>, source: LoadFacts["source"]) {
  ctx.state.draft = mergeFacts(emptyFacts(source), { ...facts, source });
  ctx.state.currentLoadId = null;
  ctx.state.candidates = null;
  ctx.state.wantsOffer = true;
}

async function applyOffer(ctx: Ctx, grossRate: number): Promise<Reply[]> {
  if (!ctx.state.draft) {
    ctx.state.draft = mergeFacts(emptyFacts(), { grossRate });
    ctx.state.wantsOffer = true;
    return evaluate(ctx, "new");
  }
  ctx.state.draft = mergeFacts(ctx.state.draft, { grossRate: roundMoney(grossRate) });
  ctx.state.wantsOffer = true;
  return evaluate(ctx, "update");
}

/** Analysis of the current draft without demanding an offer. */
function currentAnalysis(ctx: Ctx): OkAnalysis | { missing: CriticalField[] } | null {
  if (!ctx.state.draft) return null;
  const analysis = analyzeLoad(ctx.profile, ctx.state.draft, { needOffer: false });
  if (analysis.status === "OK") return analysis;
  if (analysis.status === "NEEDS_INFO") return { missing: analysis.missing };
  return null;
}

async function whatToAsk(ctx: Ctx): Promise<Reply[]> {
  const analysis = currentAnalysis(ctx);
  if (!analysis) {
    ctx.state.wantsOffer = false;
    ctx.state.draft = ctx.state.draft ?? emptyFacts();
    ctx.state.awaiting = "loadedMiles";
    return [{ text: ctx.copy.askLoadedMiles }];
  }
  if ("missing" in analysis) {
    ctx.state.wantsOffer = false;
    ctx.state.awaiting = analysis.missing[0];
    return [{ text: askFor(analysis.missing[0], ctx.copy) }];
  }
  return [{ text: renderNegotiation(analysis, ctx.profile.locale) }];
}

function brokerReplies(ctx: Ctx): Reply[] {
  const analysis = currentAnalysis(ctx);
  if (!analysis || "missing" in analysis) return [{ text: ctx.copy.brokerNeedsLoad }];
  // Two bubbles on purpose: the second is the message itself, clean to forward.
  return [{ text: ctx.copy.brokerIntro }, { text: brokerMessage(analysis) }];
}

async function save(ctx: Ctx): Promise<Reply[]> {
  if (!ctx.state.currentLoadId) return [{ text: ctx.copy.nothingToSave }];
  const load = await ctx.deps.store.updateLoad(ctx.user.id, ctx.state.currentLoadId, { status: "SAVED" });
  if (!load) return [{ text: ctx.copy.nothingToSave }];
  return [{ text: ctx.copy.saved(load.lane ?? miles(load.totalMiles)) }];
}

async function history(ctx: Ctx): Promise<Reply[]> {
  const loads = await ctx.deps.store.listLoads(ctx.user.id, { limit: 8 });
  if (!loads.length) return [{ text: ctx.copy.historyEmpty }];
  const lines = loads.map((load, index) => {
    const parts = [
      `${index + 1}. ${load.status === "SAVED" ? "💾 " : ""}${load.lane ?? miles(load.totalMiles)}`,
      load.grossRate !== null ? money(load.grossRate) : null,
      load.contributionPerMile !== null ? `${perMile(load.contributionPerMile)}${ctx.copy.labels.perMile}` : null,
      load.rating ? ctx.copy.ratings[load.rating as keyof BotCopy["ratings"]] ?? load.rating : null,
      load.score !== null ? `${load.score}/100` : null,
      load.decision ? ctx.copy.decisions[load.decision as keyof BotCopy["decisions"]] ?? load.decision : null,
    ].filter(Boolean);
    return parts.join(" · ");
  });
  return [{ text: [ctx.copy.historyTitle, "", ...lines].join("\n") }];
}

function candidateLines(ctx: Ctx, loads: LoadFacts[]): string[] {
  return loads.map((facts, index) => {
    const lane = laneLabel(facts) ?? "?";
    const rate = facts.grossRate !== null ? money(facts.grossRate) : ctx.copy.noRatePosted;
    const loaded = facts.loadedMiles !== null ? miles(facts.loadedMiles) : "? mi";
    const dh = facts.deadheadPickupMiles !== null ? ` · DH ${miles(facts.deadheadPickupMiles)}` : "";
    return `${index + 1}. ${lane} · ${rate} · ${loaded}${dh}`;
  });
}

async function search(ctx: Ctx, criteria: SearchCriteria | null): Promise<Reply[]> {
  const outcome = await searchLoads(ctx.deps.loadBoards, ctx.profile, criteria);
  if (outcome.kind === "UNAVAILABLE") return [{ text: ctx.copy.searchUnavailable }];
  if (!outcome.ranked.length) return [{ text: `${outcome.provider.isMock ? `${ctx.copy.searchMockLabel}\n\n` : ""}${ctx.copy.searchNoResults}` }];
  ctx.state.candidates = outcome.ranked.map((item) => item.load.facts);
  return [{ text: renderShortlist(outcome.ranked, ctx.profile.locale, { isMock: outcome.provider.isMock, title: ctx.copy.searchResultsTitle(outcome.ranked.length) }) }];
}

/* -- history: compare and summary ------------------------------------------ */

async function compare(ctx: Ctx, picks: number[]): Promise<Reply[]> {
  const list = await ctx.deps.store.listLoads(ctx.user.id, { limit: 8 });
  const wanted = (picks.length >= 2 ? picks : [1, 2]).filter((value, index, all) => all.indexOf(value) === index);
  const chosen = wanted.map((index) => ({ index, record: list[index - 1] })).filter((item) => item.record);
  const priced = compareLoads(ctx.profile, chosen.map((item) => item.record));
  if (priced.length < 2) return [{ text: ctx.copy.compareNeedTwo }];
  const items = priced.map((item) => ({ index: chosen.find((entry) => entry.record.id === item.record.id)!.index, item }));
  return [{ text: renderComparison(items, ctx.profile.locale) }];
}

async function summary(ctx: Ctx): Promise<Reply[]> {
  const records = await ctx.deps.store.listLoads(ctx.user.id, { limit: 50 });
  const now = ctx.deps.now();
  return [{ text: renderSummary(summarize(ctx.profile, records, now), insights(ctx.profile, records, now), ctx.profile.locale) }];
}

/* -- alerts ------------------------------------------------------------------ */

async function createAlert(ctx: Ctx, text: string): Promise<Reply[]> {
  if (!availableProvider(ctx.deps.loadBoards)) return [{ text: ctx.copy.alertUnavailable }];
  let parsed = parseAlertRequest(text);
  if ((!parsed || parsed.kind === "NEEDS_PLACE") && ctx.deps.interpreter.configured && (await withinAiQuota(ctx, "aiCalls"))) {
    const result = await ctx.deps.interpreter.interpret({ kind: "text", text }, interpretContext(ctx));
    recordAi(ctx, result.usage, "interpret");
    const search = result.ok ? result.interpretation.search : null;
    if (search && (search.nearState || search.towardState)) {
      parsed = {
        kind: "CRITERIA",
        criteria: {
          near: search.nearState ? { city: search.nearCity, state: search.nearState } : null,
          radiusMiles: search.radiusMiles,
          towardState: search.towardState,
          minRatePerTotalMile: search.minRatePerTotalMile,
        },
      };
    }
  }
  if (!parsed || parsed.kind === "NEEDS_PLACE") return [{ text: ctx.copy.alertNeedPlace }];
  const active = await ctx.deps.store.listAlerts(ctx.user.id, { activeOnly: true });
  const maxAlerts = Math.min(MAX_ALERTS_PER_USER, planLimits(ctx.deps, ctx.user.billing).maxAlerts);
  if (active.length >= maxAlerts) return [{ text: ctx.copy.alertLimit(maxAlerts) }];
  await ctx.deps.store.createAlert(ctx.user.id, parsed.criteria);
  // Creating an alert is the explicit opt-in to proactive messages.
  await ctx.deps.store.updateUser(ctx.user.id, { alertsOptInAt: ctx.deps.now(), alertsOptOutAt: null });
  return [{ text: ctx.copy.alertCreated(alertLabel(parsed.criteria, ctx.copy)) }];
}

async function listAlerts(ctx: Ctx): Promise<Reply[]> {
  const active = await ctx.deps.store.listAlerts(ctx.user.id, { activeOnly: true });
  if (!active.length) return [{ text: ctx.copy.alertsEmpty }];
  return [{ text: [ctx.copy.alertsTitle, "", ...active.map((alert, index) => `${index + 1}. ${alertLabel(alert.criteria, ctx.copy)}`), "", ctx.copy.stopHint].join("\n") }];
}

async function stopAlert(ctx: Ctx, index: number): Promise<Reply[]> {
  const active = await ctx.deps.store.listAlerts(ctx.user.id, { activeOnly: true });
  const alert = active[index - 1];
  if (!alert || !(await ctx.deps.store.deactivateAlert(ctx.user.id, alert.id))) return [{ text: ctx.copy.alertNotFound }];
  return [{ text: ctx.copy.alertStopped(index) }];
}

async function stopAllAlerts(ctx: Ctx): Promise<Reply[]> {
  const count = await ctx.deps.store.deactivateAllAlerts(ctx.user.id);
  await ctx.deps.store.updateUser(ctx.user.id, { alertsOptOutAt: ctx.deps.now() });
  return [{ text: ctx.copy.alertsAllStopped(count) }];
}

/* -- AI path --------------------------------------------------------------- */

function interpretContext(ctx: Ctx): InterpretContext {
  return { currentLoad: ctx.state.draft, today: dayKey(ctx.deps.now(), ctx.deps.timeZone) };
}

async function withinAiQuota(ctx: Ctx, kind: "aiCalls" | "transcriptions"): Promise<boolean> {
  const usage = await ctx.deps.store.getUsage(ctx.user.id, dayKey(ctx.deps.now(), ctx.deps.timeZone));
  const used = usage[kind] + (ctx.usage[kind] ?? 0);
  const limits = planLimits(ctx.deps, ctx.user.billing);
  return used < (kind === "aiCalls" ? limits.aiCallsPerDay : limits.transcriptionsPerDay);
}

/** The daily-limit message, with the way up when a paid plan exists. */
function quotaText(ctx: Ctx): string {
  return billingOn(ctx.deps) && effectivePlan(ctx.user.billing) === "FREE" ? ctx.copy.quotaUpgrade : ctx.copy.quotaExceeded;
}

/* -- plans and billing ----------------------------------------------------- */

function planSummary(ctx: Ctx): string {
  const limits = planLimits(ctx.deps, ctx.user.billing);
  const plan = effectivePlan(ctx.user.billing);
  const lines = [ctx.copy.planTitle];
  if (!billingOn(ctx.deps)) lines.push(ctx.copy.planBeta);
  else if (plan === "PRO") {
    const end = ctx.user.billing.currentPeriodEnd;
    lines.push(ctx.copy.planPro(ctx.user.billing.status ?? "active", end ? end.toISOString().slice(0, 10) : null));
  } else lines.push(ctx.copy.planFree);
  lines.push(ctx.copy.planLimits(limits.aiCallsPerDay, limits.transcriptionsPerDay, limits.maxAlerts, limits.messagesPerDay));
  if (billingOn(ctx.deps)) lines.push(plan === "PRO" ? ctx.copy.planManageHint : ctx.copy.planUpgradeHint);
  return lines.join("\n");
}

async function upgrade(ctx: Ctx): Promise<Reply[]> {
  if (!billingOn(ctx.deps)) return [{ text: ctx.copy.upgradeUnavailable }];
  if (effectivePlan(ctx.user.billing) === "PRO") return manage(ctx);
  const url = await ctx.deps.billing!.checkoutUrl(ctx.user);
  return [{ text: url ? ctx.copy.upgradeLink(url) : ctx.copy.error }];
}

async function manage(ctx: Ctx): Promise<Reply[]> {
  if (!billingOn(ctx.deps)) return [{ text: ctx.copy.upgradeUnavailable }];
  if (!ctx.user.billing.stripeCustomerId) return [{ text: ctx.copy.manageNone }];
  const url = await ctx.deps.billing!.portalUrl(ctx.user);
  return [{ text: url ? ctx.copy.manageLink(url) : ctx.copy.error }];
}

/** Is this load just more detail for the one being discussed? */
function isContinuation(ctx: Ctx, facts: LoadFacts): boolean {
  if (!ctx.state.draft) return false;
  const hasLane = facts.origin !== null || facts.destination !== null;
  return !hasLane && facts.loadedMiles === null;
}

async function actOnInterpretation(ctx: Ctx, interpretation: Interpretation, source: LoadFacts["source"]): Promise<Reply[]> {
  const loads = interpretation.loads;
  switch (interpretation.intent) {
    case "OFFER": {
      const rate = loads[0]?.grossRate ?? null;
      if (rate === null) return [{ text: ctx.copy.askGrossRate }];
      if (loads[0] && !isContinuation(ctx, loads[0])) {
        startNewLoad(ctx, loads[0], source);
        return evaluate(ctx, "new");
      }
      return applyOffer(ctx, rate);
    }
    case "WHAT_TO_ASK":
      if (loads[0]) {
        if (isContinuation(ctx, loads[0])) ctx.state.draft = mergeFacts(ctx.state.draft!, loads[0]);
        else startNewLoad(ctx, loads[0], source);
      }
      return whatToAsk(ctx);
    case "BROKER_MESSAGE": return brokerReplies(ctx);
    case "SAVE": return save(ctx);
    case "HISTORY": return history(ctx);
    case "HELP": return [{ text: ctx.copy.help }];
    case "SETTINGS": return [{ text: `${renderProfile(ctx.profile, ctx.profile.locale)}\n\n${ctx.copy.settingsHelp}` }];
    case "SEARCH": return search(ctx, interpretation.search);
    case "LOAD":
    case "OTHER":
    default: {
      if (!loads.length) return [{ text: source === "TEXT" ? ctx.copy.notALoad : ctx.copy.mediaUnreadable }];
      if (loads.length > 1) {
        ctx.state.candidates = loads;
        return [{ text: `${source === "IMAGE" ? `${ctx.copy.fromScreenshot}\n\n` : ""}${ctx.copy.pickOne(loads.length)}\n\n${candidateLines(ctx, loads).join("\n")}` }];
      }
      if (isContinuation(ctx, loads[0])) {
        ctx.state.draft = mergeFacts(ctx.state.draft!, { ...loads[0], source: ctx.state.draft!.source });
        return evaluate(ctx, ctx.state.currentLoadId ? "update" : "new");
      }
      startNewLoad(ctx, loads[0], source);
      return evaluate(ctx, "new");
    }
  }
}

async function interpretText(ctx: Ctx, text: string): Promise<Reply[]> {
  if (!ctx.deps.interpreter.configured) return [{ text: ctx.copy.aiUnavailable }];
  if (!(await withinAiQuota(ctx, "aiCalls"))) return [{ text: quotaText(ctx) }];
  const result = await ctx.deps.interpreter.interpret({ kind: "text", text }, interpretContext(ctx));
  recordAi(ctx, result.usage, "interpret");
  if (!result.ok) return [{ text: result.reason === "NOT_CONFIGURED" ? ctx.copy.aiUnavailable : ctx.copy.notALoad }];
  return actOnInterpretation(ctx, result.interpretation, "TEXT");
}

async function handleMedia(ctx: Ctx, message: InboundMessage): Promise<Reply[]> {
  const media = message.media!;
  if (message.kind === "audio") {
    if (!ctx.deps.transcriber.configured) return [{ text: ctx.copy.voiceUnavailable }];
    if (!(await withinAiQuota(ctx, "transcriptions"))) return [{ text: quotaText(ctx) }];
    const file = await ctx.deps.whatsapp.downloadMedia(media.id, ctx.deps.limits.maxMediaBytes * 4);
    if (!file.ok) return [{ text: file.reason === "TOO_LARGE" ? ctx.copy.mediaTooLarge : ctx.copy.voiceEmpty }];
    const heard = await ctx.deps.transcriber.transcribe(file.bytes, file.mimeType || media.mimeType, ctx.profile.locale);
    recordAi(ctx, heard.usage, "transcribe");
    if (!heard.ok) return [{ text: heard.reason === "NOT_CONFIGURED" ? ctx.copy.voiceUnavailable : ctx.copy.voiceEmpty }];
    ctx.preface = ctx.copy.fromVoice(heard.text);
    const replies = await handleText(ctx, heard.text, "VOICE");
    return withPreface(ctx, replies);
  }

  const isPdf = media.mimeType === "application/pdf";
  const isImage = media.mimeType.startsWith("image/");
  if (!isPdf && !isImage) return [{ text: ctx.copy.mediaUnsupported }];
  if (!ctx.deps.interpreter.configured) return [{ text: ctx.copy.aiUnavailable }];
  if (!(await withinAiQuota(ctx, "aiCalls"))) return [{ text: quotaText(ctx) }];
  const file = await ctx.deps.whatsapp.downloadMedia(media.id, ctx.deps.limits.maxMediaBytes);
  if (!file.ok) return [{ text: file.reason === "TOO_LARGE" ? ctx.copy.mediaTooLarge : ctx.copy.mediaUnreadable }];
  const source = isPdf ? "PDF" : "IMAGE";
  const result = await ctx.deps.interpreter.interpret(
    { kind: "media", source, bytes: file.bytes, mimeType: file.mimeType || media.mimeType, caption: message.text },
    interpretContext(ctx),
  );
  // Bytes are dropped here; nothing stores them.
  recordAi(ctx, result.usage, "interpret");
  if (!result.ok) return [{ text: result.reason === "TOO_LARGE" ? ctx.copy.mediaTooLarge : result.reason === "UNSUPPORTED_MEDIA" ? ctx.copy.mediaUnsupported : ctx.copy.mediaUnreadable }];
  return actOnInterpretation(ctx, result.interpretation, source);
}

/* -- text path ------------------------------------------------------------- */

async function runQuickIntent(ctx: Ctx, intent: QuickIntent, text: string, source: LoadFacts["source"]): Promise<Reply[]> {
  switch (intent.kind) {
    case "HELP":
    case "GREETING": return [{ text: ctx.copy.help }];
    case "SETTINGS_VIEW": return [{ text: `${renderProfile(ctx.profile, ctx.profile.locale)}\n\n${ctx.copy.settingsHelp}` }];
    case "SETUP":
      ctx.state.onboardingStep = "TRUCK";
      return [{ text: stepQuestion("TRUCK", ctx.copy, true) }];
    case "SAVE": return save(ctx);
    case "BROKER_MESSAGE": return brokerReplies(ctx);
    case "WHAT_TO_ASK": return whatToAsk(ctx);
    case "HISTORY": return history(ctx);
    case "RESET":
      ctx.state.draft = null;
      ctx.state.currentLoadId = null;
      ctx.state.awaiting = null;
      ctx.state.candidates = null;
      ctx.state.shortcutsLive = false;
      ctx.state.wantsOffer = true;
      return [{ text: ctx.copy.resetDone }];
    case "DELETE_DATA":
      ctx.state.pendingDelete = true;
      return [{ text: ctx.copy.deleteConfirm }];
    case "SEARCH": {
      let criteria: SearchCriteria | null = null;
      if (ctx.deps.interpreter.configured && ctx.deps.loadBoards.some((provider) => provider.status().available) && (await withinAiQuota(ctx, "aiCalls"))) {
        const result = await ctx.deps.interpreter.interpret({ kind: "text", text }, interpretContext(ctx));
        recordAi(ctx, result.usage, "interpret");
        if (result.ok) criteria = result.interpretation.search;
      }
      return search(ctx, criteria);
    }
    case "PLAN": return [{ text: planSummary(ctx) }];
    case "UPGRADE": return upgrade(ctx);
    case "MANAGE_PLAN": return manage(ctx);
    case "COMPARE": return compare(ctx, intent.picks);
    case "SUMMARY": return summary(ctx);
    case "ALERT_CREATE": return createAlert(ctx, intent.text);
    case "ALERTS_LIST": return listAlerts(ctx);
    case "ALERT_STOP": return stopAlert(ctx, intent.index);
    case "ALERTS_STOP_ALL": return stopAllAlerts(ctx);
    case "OFFER": return applyOffer(ctx, intent.grossRate);
    case "LOAD":
      startNewLoad(ctx, intent.facts, source);
      return evaluate(ctx, "new");
  }
}

async function handleText(ctx: Ctx, text: string, source: LoadFacts["source"], replyId: string | null = null): Promise<Reply[]> {
  const trimmed = text.trim();
  const clean = normalize(trimmed);

  // Buttons, and their typed 1/2/3 equivalents right after an analysis.
  const action = replyId ?? (ctx.state.shortcutsLive && !ctx.state.candidates && !ctx.state.awaiting ? SHORTCUT_IDS[clean as keyof typeof SHORTCUT_IDS] ?? null : null);
  if (action === "act:broker") return brokerReplies(ctx);
  if (action === "act:save") return save(ctx);
  if (action === "act:ask") return whatToAsk(ctx);

  // "Which of these loads?" after a screenshot or a search.
  if (ctx.state.candidates) {
    const pick = /^\d{1,2}$/.test(clean) ? Number(clean) : null;
    if (pick !== null) {
      const chosen = ctx.state.candidates[pick - 1];
      if (!chosen) return [{ text: ctx.copy.pickInvalid(ctx.state.candidates.length) }];
      startNewLoad(ctx, chosen, chosen.source);
      return evaluate(ctx, "new");
    }
  }

  const settings = parseSettingsCommand(trimmed, ctx.profile);
  if (settings?.kind === "patch") {
    ctx.profile = { ...ctx.profile, ...settings.patch };
    if (settings.keys.includes("preferences")) return [{ text: ctx.copy.preferencesCleared }];
    if (settings.keys.some((key) => key.startsWith("preferred"))) {
      const key = settings.keys[0] as "preferredOrigins" | "preferredDestinations" | "preferredFreight";
      const values = ctx.profile[key];
      return [{ text: `${ctx.copy.preferencesUpdated(ctx.copy.settingNames[key])}${values.length ? `\n${values.join(", ")}` : ""}` }];
    }
    const names = settings.keys.map((key) => (ctx.copy.settingNames as Record<string, string>)[key] ?? key).join(", ");
    const summary = settings.keys.includes("truck") ? `${names} → ${truckLabel(ctx.profile, ctx.copy)}` : names;
    const replies: Reply[] = [{ text: `${ctx.copy.settingsUpdated(summary)}\n\n${renderProfileShort(ctx.profile, ctx.profile.locale)}` }];
    // A changed setting re-prices the load on the table, so the driver sees the effect.
    if (ctx.state.draft && ctx.state.currentLoadId) {
      const again = await evaluate(ctx, "update");
      if (again[0]?.buttons) return [{ ...again[0], text: `${replies[0].text.split("\n\n")[0]}\n\n${again[0].text}` }];
    }
    return replies;
  }
  if (settings?.kind === "invalid") {
    if (settings.key.startsWith("preferred")) return [{ text: ctx.copy.preferencesInvalid }];
    const name = (ctx.copy.settingNames as Record<string, string>)[settings.key] ?? settings.key;
    return [{ text: `${ctx.copy.settingsInvalid(name)}\n\n${ctx.copy.settingsHelp}` }];
  }

  const quick = quickIntent(trimmed);
  if (quick && quick.kind !== "LOAD" && quick.kind !== "OFFER") return runQuickIntent(ctx, quick, trimmed, source);

  // Answer to the question we just asked.
  if (ctx.state.awaiting && ctx.state.draft) {
    const value = parseBareNumber(trimmed);
    if (value !== null) {
      ctx.state.draft = mergeFacts(ctx.state.draft, { [ctx.state.awaiting]: value } as Partial<LoadFacts>);
      return evaluate(ctx, ctx.state.currentLoadId ? "update" : "new");
    }
  }

  if (quick) return runQuickIntent(ctx, quick, trimmed, source);
  return interpretText(ctx, trimmed);
}

/* -- entry point ----------------------------------------------------------- */

async function respond(ctx: Ctx, message: InboundMessage): Promise<Reply[]> {
  const text = message.text?.trim() ? message.text.trim() : null;

  if (ctx.state.pendingDelete) {
    ctx.state.pendingDelete = false;
    if (text && /^(delete|borrar)$/i.test(normalize(text))) return [{ text: "__DELETE__" }];
    return [{ text: ctx.copy.deleteCancelled }];
  }

  if (message.replyId?.startsWith("lang:") || (text && languageCommand(text))) {
    const locale = (message.replyId?.slice(5) ?? languageCommand(text!)) as BotLocale;
    ctx.profile = { ...ctx.profile, locale: locale === "es" ? "es" : "en" };
    ctx.copy = copyFor(ctx.profile.locale);
    const follow = ctx.state.onboardingStep ? `\n\n${stepQuestion(ctx.state.onboardingStep, ctx.copy, true)}` : "";
    return [{ text: `${ctx.copy.languageSet}${follow}` }];
  }

  if (ctx.state.onboardingStep) {
    if (text && quickIntent(text)?.kind === "HELP") return [{ text: `${ctx.copy.help}\n\n${stepQuestion(ctx.state.onboardingStep, ctx.copy, false)}` }];
    if (text && quickIntent(text)?.kind === "DELETE_DATA") {
      ctx.state.pendingDelete = true;
      return [{ text: ctx.copy.deleteConfirm }];
    }
    return onboarding(ctx, message.kind === "text" || message.kind === "interactive" || message.kind === "button" ? text : null);
  }

  switch (message.kind) {
    case "text":
    case "interactive":
    case "button":
      return text || message.replyId ? handleText(ctx, text ?? "", "TEXT", message.replyId) : [{ text: ctx.copy.help }];
    case "image":
    case "document":
    case "audio":
      return handleMedia(ctx, message);
    default:
      return [{ text: ctx.copy.mediaUnsupported }];
  }
}

async function send(deps: BotDeps, user: AssistantUser, to: string, replies: Reply[], inboundAt: Date): Promise<number> {
  let sent = 0;
  for (const reply of replies) {
    // A retried event from yesterday must not become an unsolicited message.
    if (!isWithinServiceWindow(inboundAt, deps.now())) {
      await deps.store.recordOutbound(user.id, { waMessageId: null, kind: "TEXT", status: "WINDOW_CLOSED", errorCode: 131047, errorTitle: "outside 24h window", length: reply.text.length });
      continue;
    }
    const useButtons = Boolean(reply.buttons?.length) && reply.text.length <= WHATSAPP_INTERACTIVE_BODY_LIMIT;
    const body = !useButtons && reply.fallback ? clampForWhatsApp(`${reply.text}\n\n${reply.fallback}`) : reply.text;
    const result = useButtons ? await deps.whatsapp.sendButtons(to, body, reply.buttons!) : await deps.whatsapp.sendText(to, body);
    await deps.store.recordOutbound(user.id, {
      waMessageId: result.ok ? result.messageId : null,
      kind: useButtons ? "INTERACTIVE" : "TEXT",
      status: result.ok ? "SENT" : result.windowClosed ? "WINDOW_CLOSED" : "FAILED",
      errorCode: result.ok ? null : result.code,
      errorTitle: result.ok ? null : result.title,
      length: body.length,
    });
    if (result.ok) sent += 1;
    else if (result.retryable) throw new Error(`WhatsApp send failed (${result.code ?? "network"})`);
  }
  return sent;
}

/**
 * Handle one inbound message end to end. Throws only for errors worth a
 * retry (store down, transient send failure); the caller records them.
 */
export async function handleInbound(deps: BotDeps, message: InboundMessage): Promise<void> {
  const now = deps.now();
  const inboundAt = new Date(Math.min(message.timestamp * 1000, now.getTime()));
  let user = await deps.store.findUserByWaId(message.from);
  void deps.whatsapp.markRead(message.id);

  // A blocked number costs nothing: no reply, no AI, no usage.
  if (user?.blockedAt) return;

  if (!user) {
    // First contact. Ignore numbers outside the allowed countries (replies are
    // billed by the recipient's country) and floods of brand-new numbers.
    const access = deps.access;
    if (access?.allowedCountryCodes && !access.allowedCountryCodes.some((code) => message.from.startsWith(code))) {
      console.warn("[onroad-ai] first contact ignored: country not allowed");
      return;
    }
    if (access && access.newUsersPerHour > 0) {
      const recentNew = (await deps.store.operationalCounts(new Date(now.getTime() - 3_600_000))).newUsers;
      if (recentNew >= access.newUsersPerHour) {
        console.warn("[onroad-ai] first contact ignored: new-user limit reached");
        return;
      }
    }
    const locale = detectLocale(message.text);
    const profile = emptyProfile(locale);
    user = await deps.store.createUser({ waId: message.from, displayName: message.profileName, profile, conversation: emptyConversation() });
    const copy = copyFor(locale);
    let sent: number;
    try {
      sent = await send(deps, user, message.from, [{ text: `${copy.welcome}\n\n${stepQuestion("TRUCK", copy, true)}` }], inboundAt);
    } catch (error) {
      // Undo, so the retry is a first contact again rather than an answer to a welcome never received.
      await deps.store.deleteUser(user.id, { keepEvents: true });
      throw error;
    }
    await deps.store.updateUser(user.id, { lastInboundAt: inboundAt });
    await deps.store.addUsage(user.id, dayKey(now, deps.timeZone), { messagesIn: 1 });
    await deps.store.addUsage(user.id, dayKey(now, deps.timeZone), { messagesOut: sent, costMicros: micros(sent * deps.limits.whatsappCostPerMessageUsd), whatsappCostMicros: micros(sent * deps.limits.whatsappCostPerMessageUsd) });
    return;
  }

  const ctx: Ctx = {
    deps,
    user,
    profile: user.profile,
    state: user.conversation,
    copy: copyFor(user.profile.locale),
    usage: { messagesIn: 1 },
    preface: null,
  };

  // Burst and daily limits. The limit message is sent once, then silence.
  const day = dayKey(now, deps.timeZone);
  const recent = [...ctx.state.recent.filter((at) => now.getTime() - at < 60_000), now.getTime()];
  ctx.state.recent = recent.slice(-20);
  const usageToday = await deps.store.getUsage(user.id, day);
  let replies: Reply[];
  const dailyMessages = planLimits(deps, user.billing).messagesPerDay;
  if (usageToday.messagesIn >= dailyMessages) {
    replies = usageToday.messagesIn === dailyMessages ? [{ text: quotaText(ctx) }] : [];
  } else if (recent.length > deps.limits.burstPerMinute) {
    replies = recent.length === deps.limits.burstPerMinute + 1 ? [{ text: ctx.copy.slowDown }] : [];
  } else {
    replies = await respond(ctx, message);
  }

  if (replies[0]?.text === "__DELETE__") {
    await deps.store.deleteUser(user.id);
    // The user row is gone, so this reply is sent but not logged.
    if (isWithinServiceWindow(inboundAt, deps.now())) await deps.whatsapp.sendText(message.from, ctx.copy.deleteDone);
    return;
  }

  // Send first, then persist: if a transient send failure throws, the retry
  // starts from the same conversation state and produces the same reply.
  // (AI spend is still recorded, because it was spent.)
  let sent: number;
  try {
    sent = await send(deps, user, message.from, replies, inboundAt);
  } catch (error) {
    if (ctx.usage.aiCalls || ctx.usage.transcriptions) await deps.store.addUsage(user.id, day, { ...ctx.usage, messagesIn: 0 });
    throw error;
  }
  await deps.store.updateUser(user.id, {
    profile: ctx.profile,
    conversation: ctx.state,
    lastInboundAt: inboundAt,
    displayName: message.profileName ?? user.displayName,
  });
  await deps.store.addUsage(user.id, day, ctx.usage);
  if (sent) await deps.store.addUsage(user.id, day, { messagesOut: sent, costMicros: micros(sent * deps.limits.whatsappCostPerMessageUsd), whatsappCostMicros: micros(sent * deps.limits.whatsappCostPerMessageUsd) });
}

export { STEPS as ONBOARDING_STEPS };
