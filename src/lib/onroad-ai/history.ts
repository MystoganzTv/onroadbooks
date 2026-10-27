/**
 * THE DRIVER'S OWN HISTORY -- compare, summarize, suggest
 * =======================================================
 *
 * Everything here reads the driver's own analysed loads and nothing else.
 *
 * COMPARE re-prices each load with the driver's CURRENT profile, so two
 * loads from different weeks are judged on one basis (today's diesel, today's
 * fees). The reply says so.
 *
 * SUMMARY uses the numbers recorded when each load was analysed -- that is
 * what the driver actually saw and decided on. Ratios are weighted by miles
 * (sum of dollars / sum of miles), never an average of per-load ratios: one
 * 80-mile load must not count as much as a 1,400-mile one.
 *
 * SUGGESTIONS are deterministic and refuse thin data, the same rule as
 * ADR 0014: a pattern is mentioned only when each side of the comparison
 * has at least MIN_GROUP loads. No model writes advice.
 */

import { div, roundMoney } from "../calculations";
import { analyzeLoad, type FreightAnalysis } from "./analyze";
import type { DriverProfile } from "./profile";
import type { AssistantLoadRecord } from "./store/types";

type Ok = Extract<FreightAnalysis, { status: "OK" }>;

export const MIN_GROUP = 3;
export const MIN_LANE_LOADS = 2;
export const SUMMARY_DAYS = 30;

export interface Compared {
  record: AssistantLoadRecord;
  analysis: Ok;
}

/** Re-price stored loads with today's profile. Loads with no offer cannot be compared. */
export function compareLoads(profile: DriverProfile, records: AssistantLoadRecord[]): Compared[] {
  const out: Compared[] = [];
  for (const record of records) {
    const analysis = analyzeLoad(profile, record.facts);
    if (analysis.status === "OK" && analysis.hasOffer) out.push({ record, analysis });
  }
  return out;
}

export interface LoadSummary {
  days: number;
  analyzed: number;
  saved: number;
  withOffer: number;
  totalGross: number;
  totalMiles: number;
  /** Weighted: total gross / total miles. */
  realRpm: number;
  totalContribution: number;
  /** Weighted: total contribution / total miles. */
  contributionPerMile: number;
  ratings: Record<string, number>;
  decisions: Record<string, number>;
  /** Against the driver's CURRENT minimum (stated as such in the reply). */
  belowMinimum: { count: number; averageGap: number } | null;
  bestLane: { lane: string; loads: number; contributionPerMile: number } | null;
}

export type Insight =
  | { kind: "DEADHEAD_COST"; warnPct: number; high: number; low: number; difference: number }
  | { kind: "COUNTERS_WORK"; loads: number; averageRaise: number }
  | { kind: "MISSED_MINIMUM"; count: number; of: number; averageGap: number };

function deadheadPct(record: AssistantLoadRecord): number | null {
  const loaded = record.facts.loadedMiles ?? 0;
  const empty = (record.facts.deadheadPickupMiles ?? 0) + (record.facts.deadheadAfterMiles ?? 0);
  const total = loaded + empty;
  return total > 0 ? (empty / total) * 100 : null;
}

function weighted(records: AssistantLoadRecord[]): number {
  const contribution = records.reduce((sum, record) => sum + (record.contribution ?? 0), 0);
  const miles = records.reduce((sum, record) => sum + record.totalMiles, 0);
  return div(contribution, miles);
}

const priced = (record: AssistantLoadRecord) => record.grossRate !== null && record.contribution !== null && record.totalMiles > 0;

export function summarize(profile: DriverProfile, records: AssistantLoadRecord[], now: Date, days = SUMMARY_DAYS): LoadSummary {
  const since = now.getTime() - days * 86_400_000;
  const recent = records.filter((record) => record.createdAt.getTime() >= since);
  const offers = recent.filter(priced);
  const tally = (values: (string | null)[]) =>
    values.reduce<Record<string, number>>((acc, value) => (value ? { ...acc, [value]: (acc[value] ?? 0) + 1 } : acc), {});

  const totalGross = roundMoney(offers.reduce((sum, record) => sum + (record.grossRate ?? 0), 0));
  const totalMiles = offers.reduce((sum, record) => sum + record.totalMiles, 0);
  const totalContribution = roundMoney(offers.reduce((sum, record) => sum + (record.contribution ?? 0), 0));

  const floor = profile.minRatePerTotalMile ?? 0;
  let belowMinimum: LoadSummary["belowMinimum"] = null;
  if (floor > 0 && offers.length) {
    const gaps = offers
      .map((record) => roundMoney(record.totalMiles * floor) - (record.grossRate ?? 0))
      .filter((gap) => gap > 0);
    belowMinimum = { count: gaps.length, averageGap: gaps.length ? roundMoney(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0 };
  }

  const lanes = new Map<string, AssistantLoadRecord[]>();
  for (const record of offers) {
    if (!record.lane || record.lane.includes("?")) continue;
    lanes.set(record.lane, [...(lanes.get(record.lane) ?? []), record]);
  }
  let bestLane: LoadSummary["bestLane"] = null;
  for (const [lane, group] of lanes) {
    if (group.length < MIN_LANE_LOADS) continue;
    const perMile = weighted(group);
    if (!bestLane || perMile > bestLane.contributionPerMile) bestLane = { lane, loads: group.length, contributionPerMile: perMile };
  }

  return {
    days,
    analyzed: recent.length,
    saved: recent.filter((record) => record.status === "SAVED").length,
    withOffer: offers.length,
    totalGross,
    totalMiles,
    realRpm: div(totalGross, totalMiles),
    totalContribution,
    contributionPerMile: div(totalContribution, totalMiles),
    ratings: tally(offers.map((record) => record.rating)),
    decisions: tally(offers.map((record) => record.decision)),
    belowMinimum,
    bestLane,
  };
}

export function insights(profile: DriverProfile, records: AssistantLoadRecord[], now: Date, days = SUMMARY_DAYS): Insight[] {
  const since = now.getTime() - days * 86_400_000;
  const offers = records.filter((record) => record.createdAt.getTime() >= since && priced(record));
  const found: Insight[] = [];

  const warn = profile.deadheadWarnPct;
  const high = offers.filter((record) => (deadheadPct(record) ?? 0) > warn);
  const low = offers.filter((record) => (deadheadPct(record) ?? 0) <= warn);
  if (high.length >= MIN_GROUP && low.length >= MIN_GROUP) {
    const h = weighted(high);
    const l = weighted(low);
    if (l > h) found.push({ kind: "DEADHEAD_COST", warnPct: warn, high: h, low: l, difference: l - h });
  }

  const countered = offers.filter((record) => record.offers.length >= 2);
  if (countered.length >= 2) {
    const raises = countered.map((record) => record.offers[record.offers.length - 1] - record.offers[0]);
    const average = roundMoney(raises.reduce((a, b) => a + b, 0) / raises.length);
    if (average > 0) found.push({ kind: "COUNTERS_WORK", loads: countered.length, averageRaise: average });
  }

  const summary = summarize(profile, records, now, days);
  if (summary.belowMinimum && summary.belowMinimum.count > 0 && summary.withOffer >= MIN_GROUP) {
    found.push({ kind: "MISSED_MINIMUM", count: summary.belowMinimum.count, of: summary.withOffer, averageGap: summary.belowMinimum.averageGap });
  }
  return found;
}
