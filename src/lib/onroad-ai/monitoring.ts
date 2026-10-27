/**
 * MONITORING AND COST REPORTING
 * =============================
 *
 * Two readers of the same numbers:
 *
 *   - the operator's dashboard (/admin/onroad-ai) shows `buildReport`;
 *   - the daily maintenance cron runs `checkHealth` and, when something is
 *     wrong, sends ONE email through the alert channel OnRoad Books already
 *     uses (Resend -> OPERATIONS_ALERT_EMAIL). No new tool.
 *
 * Every cost is an ESTIMATE from configured unit prices (tokens, audio
 * minutes, WhatsApp replies), labelled as such. Meta bills only after the
 * first 1,000 service replies per number per month, so the WhatsApp line is
 * an upper bound. Fixed infrastructure (Vercel, Neon) is whatever the
 * operator enters in ONROAD_AI_FIXED_MONTHLY_COST_USD.
 */

import type { AssistantStore, BillingSummary, OperationalCounts, UsageDay } from "./store/types";

export interface MonitoringSettings {
  /** Alert when today's estimated variable cost passes this. 0 = no budget alert. */
  dailyBudgetUsd: number;
  fixedMonthlyCostUsd: number;
}

export type HealthIssue =
  | { kind: "DEAD_EVENTS"; count: number }
  | { kind: "SEND_FAILURES"; failed: number; sent: number }
  | { kind: "BACKLOG"; pending: number }
  | { kind: "OVER_BUDGET"; costUsd: number; budgetUsd: number }
  | { kind: "NEW_USER_SPIKE"; count: number };

export const SEND_FAILURE_RATE = 0.2;
export const MIN_SENDS_FOR_RATE = 10;
export const BACKLOG_LIMIT = 20;

export function evaluateHealth(counts: OperationalCounts, todayCostUsd: number, settings: MonitoringSettings, newUserSpikeAt: number): HealthIssue[] {
  const issues: HealthIssue[] = [];
  if (counts.deadEvents > 0) issues.push({ kind: "DEAD_EVENTS", count: counts.deadEvents });
  const attempts = counts.outboundSent + counts.outboundFailed;
  if (attempts >= MIN_SENDS_FOR_RATE && counts.outboundFailed / attempts >= SEND_FAILURE_RATE) {
    issues.push({ kind: "SEND_FAILURES", failed: counts.outboundFailed, sent: counts.outboundSent });
  }
  if (counts.pendingEvents > BACKLOG_LIMIT) issues.push({ kind: "BACKLOG", pending: counts.pendingEvents });
  if (settings.dailyBudgetUsd > 0 && todayCostUsd > settings.dailyBudgetUsd) {
    issues.push({ kind: "OVER_BUDGET", costUsd: todayCostUsd, budgetUsd: settings.dailyBudgetUsd });
  }
  if (newUserSpikeAt > 0 && counts.newUsers >= newUserSpikeAt) issues.push({ kind: "NEW_USER_SPIKE", count: counts.newUsers });
  return issues;
}

export function describeIssue(issue: HealthIssue): string {
  switch (issue.kind) {
    case "DEAD_EVENTS": return `${issue.count} driver message(s) failed permanently in the last 24 hours (see /admin/onroad-ai).`;
    case "SEND_FAILURES": return `${issue.failed} of ${issue.failed + issue.sent} WhatsApp sends failed in the last 24 hours. Check the access token and the number's quality rating.`;
    case "BACKLOG": return `${issue.pending} driver messages are waiting to be answered.`;
    case "OVER_BUDGET": return `Estimated cost today is $${issue.costUsd.toFixed(2)}, over the $${issue.budgetUsd.toFixed(2)} daily budget.`;
    case "NEW_USER_SPIKE": return `${issue.count} new numbers in the last 24 hours — check for spam before it costs money.`;
  }
}

function shiftDay(day: string, deltaDays: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

export interface CostReport {
  fromDay: string;
  toDay: string;
  /** One entry per calendar day, zero-filled. */
  days: UsageDay[];
  totals: Omit<UsageDay, "day" | "activeUsers">;
  activeDrivers30d: number;
  billing: BillingSummary;
  variableCostUsd: number;
  fixedCostUsd: number;
  revenueUsd: number;
  /** Revenue minus variable and fixed cost over the window. Estimate. */
  marginUsd: number;
  costPerActiveDriverUsd: number;
}

const usd = (micros: number) => micros / 1_000_000;

export async function buildReport(store: AssistantStore, today: string, settings: MonitoringSettings, windowDays = 30): Promise<CostReport> {
  const fromDay = shiftDay(today, -(windowDays - 1));
  const series = await store.usageSeries(fromDay, today);
  const byDay = new Map(series.map((day) => [day.day, day]));
  const days: UsageDay[] = [];
  for (let offset = 0; offset < windowDays; offset += 1) {
    const day = shiftDay(fromDay, offset);
    days.push(byDay.get(day) ?? { day, activeUsers: 0, messagesIn: 0, messagesOut: 0, aiCalls: 0, transcriptions: 0, costMicros: 0, aiCostMicros: 0, transcribeCostMicros: 0, whatsappCostMicros: 0 });
  }
  const sum = (key: keyof Omit<UsageDay, "day" | "activeUsers">) => days.reduce((total, day) => total + day[key], 0);
  const totals = {
    messagesIn: sum("messagesIn"),
    messagesOut: sum("messagesOut"),
    aiCalls: sum("aiCalls"),
    transcriptions: sum("transcriptions"),
    costMicros: sum("costMicros"),
    aiCostMicros: sum("aiCostMicros"),
    transcribeCostMicros: sum("transcribeCostMicros"),
    whatsappCostMicros: sum("whatsappCostMicros"),
  };
  const users = await store.listUsersForAdmin({ limit: 500, since30d: new Date(`${fromDay}T00:00:00Z`), day30: fromDay });
  const activeDrivers30d = users.filter((user) => user.messagesIn30d > 0).length;
  const billing = await store.billingSummary();
  const variableCostUsd = usd(totals.costMicros);
  const fixedCostUsd = (settings.fixedMonthlyCostUsd * windowDays) / 30;
  const revenueUsd = (billing.mrrCents / 100) * (windowDays / 30);
  return {
    fromDay,
    toDay: today,
    days,
    totals,
    activeDrivers30d,
    billing,
    variableCostUsd,
    fixedCostUsd,
    revenueUsd,
    marginUsd: revenueUsd - variableCostUsd - fixedCostUsd,
    costPerActiveDriverUsd: activeDrivers30d ? (variableCostUsd + fixedCostUsd) / activeDrivers30d : 0,
  };
}

export async function checkHealth(
  store: AssistantStore,
  now: Date,
  today: string,
  settings: MonitoringSettings,
  newUserSpikeAt: number,
): Promise<{ counts: OperationalCounts; todayCostUsd: number; issues: HealthIssue[] }> {
  const counts = await store.operationalCounts(new Date(now.getTime() - 24 * 3_600_000));
  const [todayRow] = await store.usageSeries(today, today);
  const todayCostUsd = usd(todayRow?.costMicros ?? 0);
  return { counts, todayCostUsd, issues: evaluateHealth(counts, todayCostUsd, settings, newUserSpikeAt) };
}

/** Last digits only: the operator recognises a driver without the dashboard exposing numbers. */
export function maskWaId(waId: string): string {
  if (waId.startsWith("web-")) return "Web chat";
  return waId.length <= 4 ? "••••" : `+${waId.slice(0, Math.max(1, waId.length - 10))} ••• ${waId.slice(-4)}`;
}
