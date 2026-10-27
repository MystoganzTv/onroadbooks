/**
 * LOAD ALERTS
 * ===========
 *
 * "Notify me when a load above $2.20/total mile appears within 100 miles of
 * Chicago IL."
 *
 * Rules, in the order they are enforced:
 *
 *   1. AUTHORIZED DATA ONLY. An alert can only be created while an
 *      authorized provider is available, and the runner skips every alert
 *      when none is. Today that means: off in production (DAT is not
 *      connected), on in development with the TEST DATA board.
 *   2. OPT-IN. Creating an alert is the explicit opt-in and is recorded
 *      (`alertsOptInAt`). STOP records the opt-out, stops every alert, and
 *      the runner never messages an opted-out driver.
 *   3. THE 24-HOUR WINDOW. Inside it, the shortlist is sent as a normal
 *      message. Outside it, only an APPROVED utility template can be sent
 *      (WHATSAPP_ALERT_TEMPLATE); with no template configured nothing is
 *      sent and the loads are NOT marked as delivered, so they go out once
 *      the driver writes again.
 *   4. DEDUPLICATION. A load is sent once per alert (unique key on alert +
 *      provider + load id), recorded only after a successful send.
 *   5. LIMITS. At most `perRun` loads per message, `perUserPerDay` loads per
 *      driver per day across all alerts, `maxAlertsPerUser` active alerts,
 *      and each alert is checked at most once per `intervalMinutes`.
 */

import { cleanState } from "../rate-con/schema";
import { copyFor, type BotCopy } from "./copy";
import { renderShortlist } from "./format";
import { miles, perMile } from "./numbers";
import { rankLoads, buildQuery } from "./loadboard/search";
import type { LoadBoardProvider } from "./loadboard/provider";
import type { BotDeps } from "./router";
import { normalize } from "./settings";
import type { AlertCriteria, AssistantAlertRecord } from "./store/types";
import { isWithinServiceWindow } from "./whatsapp/client";

export const MAX_ALERTS_PER_USER = 3;

export interface AlertSettings {
  intervalMinutes: number;
  perRun: number;
  perUserPerDay: number;
  maxAlertsPerRun: number;
  /**
   * Approved template for sends outside the 24-hour window, with the
   * language code of each approved translation. Null = none configured.
   */
  template: { name: string; languages: Record<"en" | "es", string> } | null;
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  intervalMinutes: 60,
  perRun: 3,
  perUserPerDay: 5,
  maxAlertsPerRun: 50,
  template: null,
};

const STATE = String.raw`([A-Za-z]{2})`;

export type AlertParse =
  | { kind: "CRITERIA"; criteria: AlertCriteria }
  | { kind: "NEEDS_PLACE" };

/** "alert me / notify me / avísame ..." -- null when the message is not an alert request. */
export function parseAlertRequest(text: string): AlertParse | null {
  const clean = normalize(text);
  if (!/^(alert me|alert|notify me|notify|let me know|tell me when|text me when|avisame|alertame|notificame|mandame una alerta|aviso)\b/.test(clean)) return null;

  const rate =
    clean.match(/\$\s*(\d+(?:[.,]\d+)?)\s*(?:\/|per|por|a la)\s*(?:total\s*)?(?:mi|mile|milla)/) ??
    clean.match(/(?:above|over|more than|at least|mas de|arriba de|minimo|al menos)\s*\$?\s*(\d+(?:[.,]\d+)?)\s*(?:\/|per|por)?\s*(?:total\s*)?(?:mi|mile|milla)?/);
  const rateValue = rate ? Number(rate[1].replace(",", ".")) : null;
  const minRatePerTotalMile = rateValue !== null && rateValue > 0 && rateValue < 20 ? rateValue : null;

  const radius =
    clean.match(/within\s+(\d{1,4})\s*(?:mi|miles)/) ??
    clean.match(/(\d{1,4})\s*(?:mi|miles|millas)\s+(?:of|from|de|alrededor de)/) ??
    clean.match(/a\s+(\d{1,4})\s*millas/);
  const radiusMiles = radius ? Number(radius[1]) : null;

  // "of Chicago IL", "near Gary, IN", "cerca de Joliet IL", "de Chicago IL".
  // Spanish "de" is also Delaware's code and "más de" is not a city, so take
  // every candidate, drop the ones whose "city" is a filler word, prefer a
  // state typed in capitals, and use the last one (the place comes last).
  const FILLER = /^(mas|más|menos|arriba|loads?|cargas?|alert|me|the|una?|los|las)$/i;
  const candidates = [...text.matchAll(new RegExp(String.raw`(?:\bof|\bfrom|\bnear|\baround|\bcerca de|\bde|\bdesde)\s+([A-Za-zÀ-ÿ.'-]+(?:\s+[A-Za-zÀ-ÿ.'-]+)?)[,\s]+${STATE}\b`, "gi"))]
    .map((match) => ({ city: match[1].trim(), raw: match[2], state: cleanState(match[2].toUpperCase()) }))
    .filter((match) => match.state && !match.city.split(/\s+/).some((word) => FILLER.test(word)));
  const upper = candidates.filter((match) => match.raw === match.raw.toUpperCase());
  const near = (upper.length ? upper : candidates).at(-1) ?? null;
  const nearState = near?.state ?? null;

  const toward = clean.match(/(?:toward|towards|heading to|going to|hacia|rumbo a|con destino a)\s+([a-z ]{2,20}?)(?:\s+(?:above|over|with|within|con|de|a)\b|[.,!]|$)/);
  const towardState = toward ? cleanState(toward[1].trim().length === 2 ? toward[1].trim().toUpperCase() : toward[1].trim()) : null;

  const nearPlace = near && nearState
    ? { city: near.city.split(/\s+/).map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" "), state: nearState }
    : null;
  if (!nearPlace && !towardState) return { kind: "NEEDS_PLACE" };
  return { kind: "CRITERIA", criteria: { near: nearPlace, radiusMiles, towardState, minRatePerTotalMile } };
}

export function alertLabel(criteria: AlertCriteria, copy: BotCopy): string {
  const parts: string[] = [];
  if (criteria.near) {
    const place = [criteria.near.city, criteria.near.state].filter(Boolean).join(", ");
    parts.push(copy.alertLabel.near(place, criteria.radiusMiles ? miles(criteria.radiusMiles) : null));
  }
  if (criteria.towardState) parts.push(copy.alertLabel.toward(criteria.towardState));
  if (criteria.minRatePerTotalMile) parts.push(copy.alertLabel.minRate(perMile(criteria.minRatePerTotalMile)));
  return parts.join(", ");
}

export function availableProvider(providers: LoadBoardProvider[]): LoadBoardProvider | null {
  return providers.find((provider) => provider.status().available) ?? null;
}

export interface AlertRunResult {
  checked: number;
  skippedNoProvider: boolean;
  sent: number;
  loadsSent: number;
  heldForWindow: number;
  capped: number;
  /** The driver was mid-conversation; checked again next interval. */
  busy: number;
  failed: number;
}

/**
 * Check every due alert once. Safe to call from a cron, an admin action or a
 * test; it never sends to an opted-out driver and never resends a load.
 */
export async function runAlerts(deps: BotDeps, settings: AlertSettings = DEFAULT_ALERT_SETTINGS): Promise<AlertRunResult> {
  const result: AlertRunResult = { checked: 0, skippedNoProvider: false, sent: 0, loadsSent: 0, heldForWindow: 0, capped: 0, busy: 0, failed: 0 };
  const provider = availableProvider(deps.loadBoards);
  if (!provider) {
    result.skippedNoProvider = true;
    return result;
  }
  const now = deps.now();
  const due = await deps.store.listDueAlerts(new Date(now.getTime() - settings.intervalMinutes * 60_000), settings.maxAlertsPerRun);
  const dayStart = new Date(now.getTime() - 24 * 60 * 60_000);

  for (const alert of due) {
    result.checked += 1;
    await deps.store.markAlertChecked(alert.id, now);
    try {
      await runOne(deps, provider, alert, settings, dayStart, result);
    } catch (error) {
      result.failed += 1;
      console.error("[onroad-ai] alert failed", error instanceof Error ? error.name : "unknown");
    }
  }
  return result;
}

async function runOne(
  deps: BotDeps,
  provider: LoadBoardProvider,
  alert: AssistantAlertRecord,
  settings: AlertSettings,
  dayStart: Date,
  result: AlertRunResult,
) {
  const user = await deps.store.getUserById(alert.userId);
  if (!user || !user.alertsOptInAt || (user.alertsOptOutAt && user.alertsOptOutAt >= user.alertsOptInAt)) return;

  const sentToday = await deps.store.countAlertMatchesSince(user.id, dayStart);
  const room = Math.min(settings.perRun, settings.perUserPerDay - sentToday);
  if (room <= 0) {
    result.capped += 1;
    return;
  }

  const criteria = alert.criteria;
  const loads = await provider.searchLoads(
    buildQuery(user.profile, {
      nearCity: criteria.near?.city ?? null,
      nearState: criteria.near?.state ?? null,
      radiusMiles: criteria.radiusMiles,
      towardState: criteria.towardState,
      minRatePerTotalMile: criteria.minRatePerTotalMile,
      pickupDate: null,
    }),
  );
  const ranked = rankLoads(user.profile, loads, criteria.minRatePerTotalMile);
  const fresh = [];
  for (const item of ranked) {
    if (fresh.length >= room) break;
    if (!(await deps.store.hasAlertMatch(alert.id, item.load.providerId, item.load.providerLoadId))) fresh.push(item);
  }
  if (!fresh.length) return;

  // Never write the conversation while a reply to this driver is being produced.
  const holder = `alert:${alert.id}:${deps.now().getTime()}`;
  if (!(await deps.store.acquireLease(user.waId, holder, 60_000))) {
    result.busy += 1;
    return;
  }
  try {
    await deliver(deps, provider, alert, settings, fresh, result);
  } finally {
    await deps.store.releaseLease(user.waId, holder);
  }
}

async function deliver(
  deps: BotDeps,
  provider: LoadBoardProvider,
  alert: AssistantAlertRecord,
  settings: AlertSettings,
  fresh: ReturnType<typeof rankLoads>,
  result: AlertRunResult,
) {
  // Re-read inside the lease: the conversation may have moved on.
  const user = await deps.store.getUserById(alert.userId);
  if (!user) return;
  const criteria = alert.criteria;
  const copy = copyFor(user.profile.locale);
  const label = alertLabel(criteria, copy);
  const inWindow = isWithinServiceWindow(user.lastInboundAt, deps.now());
  let sent = false;
  if (inWindow) {
    const text = renderShortlist(fresh, user.profile.locale, { isMock: provider.isMock, title: copy.alertResultsTitle(label), footer: copy.stopHint });
    const reply = await deps.whatsapp.sendText(user.waId, text);
    await deps.store.recordOutbound(user.id, { waMessageId: reply.ok ? reply.messageId : null, kind: "TEXT", status: reply.ok ? "SENT" : reply.windowClosed ? "WINDOW_CLOSED" : "FAILED", errorCode: reply.ok ? null : reply.code, errorTitle: reply.ok ? null : reply.title, length: text.length });
    sent = reply.ok;
  } else if (settings.template) {
    // The template only announces; the loads are shown when the driver replies.
    const reply = await deps.whatsapp.sendTemplate(user.waId, settings.template.name, settings.template.languages[user.profile.locale], [String(fresh.length), label]);
    await deps.store.recordOutbound(user.id, { waMessageId: reply.ok ? reply.messageId : null, kind: "TEXT", status: reply.ok ? "SENT" : "FAILED", errorCode: reply.ok ? null : reply.code, errorTitle: reply.ok ? null : reply.title, length: 0 });
    sent = reply.ok;
  } else {
    result.heldForWindow += 1;
    return;
  }
  if (!sent) {
    result.failed += 1;
    return;
  }

  for (const item of fresh) await deps.store.recordAlertMatch(user.id, alert.id, item.load.providerId, item.load.providerLoadId);
  // "Reply 1-3" prices one, exactly like search results.
  const conversation = { ...user.conversation, candidates: fresh.map((item) => item.load.facts), shortcutsLive: false };
  await deps.store.updateUser(user.id, { conversation });
  const usageDay = new Intl.DateTimeFormat("en-CA", { timeZone: deps.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(deps.now());
  await deps.store.addUsage(user.id, usageDay, { messagesOut: 1, costMicros: Math.round(deps.limits.whatsappCostPerMessageUsd * 1_000_000), whatsappCostMicros: Math.round(deps.limits.whatsappCostPerMessageUsd * 1_000_000) });
  result.sent += 1;
  result.loadsSent += fresh.length;
}

export function alertSettingsFromEnv(env: Record<string, string | undefined> = process.env): AlertSettings {
  const number = (key: string, fallback: number) => {
    const value = Number(env[key]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  const name = env.WHATSAPP_ALERT_TEMPLATE?.trim();
  return {
    intervalMinutes: number("ONROAD_AI_ALERT_INTERVAL_MINUTES", DEFAULT_ALERT_SETTINGS.intervalMinutes),
    perRun: number("ONROAD_AI_ALERT_LOADS_PER_MESSAGE", DEFAULT_ALERT_SETTINGS.perRun),
    perUserPerDay: number("ONROAD_AI_ALERT_LOADS_PER_DAY", DEFAULT_ALERT_SETTINGS.perUserPerDay),
    maxAlertsPerRun: number("ONROAD_AI_ALERTS_PER_RUN", DEFAULT_ALERT_SETTINGS.maxAlertsPerRun),
    template: name
      ? {
          name,
          languages: {
            en: env.WHATSAPP_ALERT_TEMPLATE_LANG_EN?.trim() || "en_US",
            es: env.WHATSAPP_ALERT_TEMPLATE_LANG_ES?.trim() || "es",
          },
        }
      : null,
  };
}
