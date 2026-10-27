/**
 * WHATSAPP RENDERING
 * ==================
 *
 * Turns a FreightAnalysis into one phone-sized message. One message on
 * purpose: since 2026-10-01 Meta bills every delivered reply after the first
 * 1,000 per number per month, and a result split into four bubbles costs
 * four times as much and reads worse.
 *
 * WhatsApp formatting: *bold*, _italic_, no tables, no HTML. Body limit for
 * a text message is 4,096 characters; an interactive (button) message body
 * is 1,024, which is why the router falls back to typed shortcuts when the
 * analysis is longer.
 */

import type { FreightAnalysis, Caution, ConfirmItem, DecisionReason } from "./analyze";
import { copyFor, type BotCopy } from "./copy";
import type { CompatibilityIssue } from "./equipment";
import { laneLabel, type LoadFacts } from "./load-facts";
import { cost, miles, money, pct, perMile, pounds } from "./numbers";
import type { Compared, Insight, LoadSummary } from "./history";
import type { RankedLoad } from "./loadboard/search";
import type { BotLocale, DriverProfile } from "./profile";

type OkAnalysis = Extract<FreightAnalysis, { status: "OK" }>;

export const WHATSAPP_TEXT_LIMIT = 4_096;
export const WHATSAPP_INTERACTIVE_BODY_LIMIT = 1_024;

export function truckLabel(profile: DriverProfile, copy: BotCopy): string {
  if (!profile.truckType) return copy.notSet;
  const name = copy.equipment[profile.truckType];
  return profile.truckLengthFt ? `${profile.truckLengthFt} ft ${name}` : name;
}

function fee(mode: "PCT" | "AMOUNT", value: number | null, copy: BotCopy): string {
  if (value === null) return copy.notSet;
  return mode === "PCT" ? `${value}%` : money(value);
}

export function compatibilityText(issue: CompatibilityIssue, copy: BotCopy): string {
  const c = copy.confirmItems;
  switch (issue.kind) {
    case "EQUIPMENT_UNKNOWN": return c.equipmentUnknown;
    case "TRUCK_UNKNOWN": return c.truckUnknown;
    case "EQUIPMENT_MISMATCH": return c.equipmentMismatch(copy.equipment[issue.required], copy.equipment[issue.truck]);
    case "EQUIPMENT_CONFIRM": return c.equipmentConfirm(copy.equipment[issue.required], copy.equipment[issue.truck]);
    case "OVERWEIGHT": return c.overweight(pounds(issue.weightLbs), pounds(issue.capacityLbs));
    case "WEIGHT_UNKNOWN": return c.weightUnknown;
    case "CAPACITY_UNKNOWN": return c.capacityUnknown(pounds(issue.weightLbs));
    case "TOO_LONG": return c.tooLong(String(issue.requiredFt), String(issue.truckFt));
    case "LIFTGATE_MISSING": return c.liftgateMissing;
    case "LIFTGATE_UNKNOWN": return c.liftgateUnknown;
    case "PALLET_JACK_MISSING": return c.palletJackMissing;
    case "PALLET_JACK_UNKNOWN": return c.palletJackUnknown;
  }
}

function confirmText(item: ConfirmItem, copy: BotCopy): string {
  const c = copy.confirmItems;
  switch (item.kind) {
    case "COMPATIBILITY": return compatibilityText(item.issue, copy);
    case "SCHEDULE_TIGHT": return c.scheduleTight(miles(item.milesPerDay), miles(item.maxMilesPerDay));
    case "DATES_UNKNOWN": return c.datesUnknown;
    case "TOLLS_ASSUMED": return c.tollsAssumed(money(item.amount));
    case "EXTRA_STOPS": return c.extraStops(item.stops);
    case "PARTIAL_LOAD": return c.partial;
    case "ROUND_TRIP_RETURN_UNKNOWN": return c.roundTripReturn;
  }
}

function cautionText(caution: Caution, copy: BotCopy): string {
  switch (caution.kind) {
    case "DEADHEAD_HIGH": return copy.cautions.deadheadHigh(pct(caution.pct), pct(caution.warnPct, 0));
    case "DEADHEAD_OVER_MAX": return copy.cautions.deadheadOverMax(miles(caution.miles), miles(caution.maxMiles));
    case "AFTER_MAINTENANCE_NEGATIVE": return copy.cautions.afterMaintenanceNegative(money(caution.amount));
  }
}

function reasonText(reason: DecisionReason, analysis: OkAnalysis, copy: BotCopy): string {
  const r = copy.reasons;
  switch (reason.kind) {
    case "INCOMPATIBLE": {
      const text = compatibilityText(reason.issue, copy);
      return r.incompatible(text.charAt(0).toUpperCase() + text.slice(1));
    }
    case "BELOW_PROFITABILITY_FLOOR": return r.belowFloor(money(reason.walkAway));
    case "BELOW_OPERATIONAL_MINIMUM":
      return r.belowMinimum(money(reason.shortfall), perMile(reason.floor), money(analysis.negotiation.ask.rate));
    case "MARGINAL": return r.marginal(money(reason.target));
    case "CAUTION": return r.caution(cautionText(reason.caution, copy), money(reason.ask));
    case "MEETS_ALL": {
      const rating = copy.ratings[reason.rating];
      return reason.ask === null ? r.meetsAll(rating) : r.meetsAllAsk(rating, money(reason.ask));
    }
  }
}

function sourceLine(facts: LoadFacts, copy: BotCopy): string | null {
  if (facts.source === "IMAGE") return copy.fromScreenshot;
  if (facts.source === "PDF") return copy.fromDocument;
  return null;
}

/**
 * Contribution per mile as printed beside its rating. Normal cent rounding,
 * except when rounding would reach the next band's threshold: $0.8973 next to
 * MARGINAL prints $0.89, never "$0.90 -- MARGINAL" under a $0.90 GOOD floor.
 * Same rule as `realRpmForDisplay` for the operational minimum.
 */
export function contributionPerMileForDisplay(analysis: OkAnalysis): number {
  const value = analysis.estimate.contributionProfitPerMile;
  const tier = (key: "minimum" | "good" | "great") => analysis.target.tiers.find((item) => item.key === key)?.profitPerMile ?? Infinity;
  const next = { BAD: tier("minimum"), MARGINAL: tier("good"), GOOD: tier("great"), GREAT: Infinity }[analysis.estimate.score.rating];
  const rounded = Math.round(value * 100) / 100;
  return rounded >= next ? Math.floor(value * 100 + 1e-9) / 100 : value;
}

function minimumLine(analysis: OkAnalysis, copy: BotCopy): string {
  const floor = analysis.estimate.operationalMinimum;
  if (floor.meets === null) return copy.noMinimum;
  return floor.meets
    ? copy.meetsMinimum(perMile(floor.ratePerTotalMile))
    : copy.belowMinimum(perMile(floor.ratePerTotalMile), money(floor.shortfall));
}

function negotiationBlock(analysis: OkAnalysis, copy: BotCopy): string[] {
  const l = copy.labels;
  const n = analysis.negotiation;
  const at = (point: { rate: number; perTotalMile: number }) =>
    `${money(point.rate)} (${perMile(point.perTotalMile)}${l.perMile})`;
  if (analysis.hasOffer && !n.counterNeeded) {
    return [`💵 *${l.negotiation}*`, copy.noCounter, `${l.walkAway}: ${at(n.walkAway)}`];
  }
  return [
    `💵 *${l.negotiation}*`,
    `${l.ask}: ${at(n.ask)}`,
    `${l.target}: ${at(n.target)}`,
    `${l.walkAway}: ${at(n.walkAway)}`,
  ];
}

/** The full verdict, in the order the product spec lays it out. */
export function renderAnalysis(analysis: OkAnalysis, locale: BotLocale): string {
  const copy = copyFor(locale);
  const l = copy.labels;
  const e = analysis.estimate;
  const lines: string[] = [];

  const source = sourceLine(analysis.facts, copy);
  if (source) lines.push(source, "");
  const lane = laneLabel(analysis.facts);
  if (lane) lines.push(`🚛 *${lane}*`, "");

  if (analysis.hasOffer) lines.push(`💵 ${l.offer}: *${money(analysis.facts.grossRate ?? 0)}*`);
  lines.push(`🛣️ ${l.loaded}: ${miles(e.loadedMiles)}`);
  lines.push(`🚛 ${l.deadhead}: ${miles(e.deadheadPickupMiles)}`);
  if (e.deadheadAfterMiles > 0) lines.push(`↩️ ${l.deadheadAfter}: ${miles(e.deadheadAfterMiles)}`);
  lines.push(`📍 ${l.total}: ${miles(e.totalMiles)}`);

  if (analysis.hasOffer) {
    const floorMark = e.operationalMinimum.meets === null ? "" : e.operationalMinimum.meets ? " ✅" : " ❌";
    lines.push("", `${l.rpmLoaded}: ${perMile(e.grossPerLoadedMile)}`, `${l.rpmTotal}: ${perMile(analysis.displayRealRpm)}${floorMark}`);
    lines.push(`${l.minimum}: ${minimumLine(analysis, copy)}`);

    lines.push("", `💰 *${l.financials}*`);
    lines.push(`${l.fuel}: ${cost(e.fuelCost)}`);
    lines.push(`${l.dispatch}: ${cost(e.dispatch)}`);
    lines.push(`${l.factoring}: ${cost(e.factoring)}`);
    lines.push(`${l.tolls}: ${e.tolls > 0 ? cost(e.tolls) : `${money(0)} (${l.noTolls})`}`);
    if (e.otherCost > 0) lines.push(`${l.other}: ${cost(e.otherCost)}`);
    lines.push(
      "",
      `*${l.contribution}: ${money(e.contributionProfit)}*`,
      `${perMile(contributionPerMileForDisplay(analysis))}${l.perMile} · ${pct(e.contributionMargin)} ${l.margin}`,
    );
    if (e.maintenanceAllocation > 0) {
      lines.push("", `${l.maintenance}: ${cost(e.maintenanceAllocation)}`, `*${l.afterMaintenance}: ${money(e.contributionAfterMaintenance)}*`);
    }

    lines.push(
      "",
      `📊 *${l.score}: ${e.score.score}/100* (${copy.bands[analysis.scoreBand]})`,
      `${l.classification}: *${copy.ratings[e.score.rating]}*`,
    );
  } else {
    lines.push("", copy.whatToAskNoOffer);
  }

  lines.push("", ...negotiationBlock(analysis, copy));

  if (analysis.decision && analysis.reason) {
    lines.push("", `🚦 *${l.decision}: ${copy.decisions[analysis.decision]}*`, `${l.reason}: ${reasonText(analysis.reason, analysis, copy)}`);
  }

  const confirm = analysis.confirm.map((item) => confirmText(item, copy));
  if (analysis.hasOffer) {
    for (const caution of analysis.cautions) {
      if (analysis.reason?.kind === "CAUTION" && analysis.reason.caution === caution) continue;
      confirm.unshift(cautionText(caution, copy));
    }
  }
  if (confirm.length) lines.push("", `☑️ ${l.confirmFirst}: ${confirm.join("; ")}.`);

  return lines.join("\n");
}

/** Just the negotiation numbers, for "what should I ask?" / "lowest I should take?". */
export function renderNegotiation(analysis: OkAnalysis, locale: BotLocale): string {
  const copy = copyFor(locale);
  const lane = laneLabel(analysis.facts) ?? miles(analysis.estimate.totalMiles);
  const lines = [copy.whatToAskTitle(lane), ""];
  if (!analysis.hasOffer) lines.push(copy.whatToAskNoOffer, "");
  lines.push(...negotiationBlock(analysis, copy).slice(1));
  lines.push(`${copy.labels.total}: ${miles(analysis.estimate.totalMiles)}`);
  return lines.join("\n");
}

export function renderProfile(profile: DriverProfile, locale: BotLocale): string {
  const copy = copyFor(locale);
  const n = copy.settingNames;
  const opt = (value: number | null, render: (value: number) => string) => (value === null ? copy.notSet : render(value));
  const bool = (value: boolean | null) => (value === null ? copy.notSet : value ? copy.yes : copy.no);
  return [
    `*${copy.settingsTitle}*`,
    `${n.truck}: ${truckLabel(profile, copy)}`,
    `${n.mpg}: ${opt(profile.mpg, String)} · ${n.fuelPrice}: ${opt(profile.fuelPrice, perMile)}/gal`,
    `${n.dispatch}: ${fee(profile.dispatchMode, profile.dispatchValue, copy)} · ${n.factoring}: ${fee(profile.factoringMode, profile.factoringValue, copy)}`,
    `${n.maintenancePerMile}: ${perMile(profile.maintenancePerMile)}/mi`,
    `${n.minRatePerTotalMile}: ${opt(profile.minRatePerTotalMile, (value) => (value > 0 ? `${perMile(value)}/total mi` : copy.noMinimum))}`,
    `${n.ratingGreat} ≥ ${perMile(profile.ratingGreat)} · ${n.ratingGood} ≥ ${perMile(profile.ratingGood)} · ${n.ratingMarginal} ≥ ${perMile(profile.ratingMarginal)}`,
    `${n.deadheadWarnPct}: ${pct(profile.deadheadWarnPct, 0)} · ${n.maxDeadheadMiles}: ${opt(profile.maxDeadheadMiles, miles)}`,
    `${n.cargoCapacityLbs}: ${opt(profile.cargoCapacityLbs, pounds)} · ${n.hasLiftgate}: ${bool(profile.hasLiftgate)} · ${n.hasPalletJack}: ${bool(profile.hasPalletJack)}`,
    `${n.defaultTolls}: ${money(profile.defaultTolls)} · ${n.maxMilesPerDay}: ${miles(profile.maxMilesPerDay)}`,
  ].join("\n");
}

export function renderProfileShort(profile: DriverProfile, locale: BotLocale): string {
  const copy = copyFor(locale);
  const n = copy.settingNames;
  return [
    `🚛 ${truckLabel(profile, copy)} · ${profile.mpg ?? "?"} MPG · ${profile.fuelPrice !== null ? perMile(profile.fuelPrice) : "?"}/gal`,
    `🧾 ${n.dispatch} ${fee(profile.dispatchMode, profile.dispatchValue, copy)} · ${n.factoring} ${fee(profile.factoringMode, profile.factoringValue, copy)}`,
    `📏 ${n.minRatePerTotalMile}: ${profile.minRatePerTotalMile ? `${perMile(profile.minRatePerTotalMile)}/total mi` : copy.noMinimum}`,
    `🔧 ${n.maintenancePerMile} ${perMile(profile.maintenancePerMile)}/mi · ${n.ratingGreat}/${n.ratingGood}/${n.ratingMarginal} ${perMile(profile.ratingGreat)}/${perMile(profile.ratingGood)}/${perMile(profile.ratingMarginal)}`,
  ].join("\n");
}

export function clampForWhatsApp(text: string, limit = WHATSAPP_TEXT_LIMIT): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
}

/** Search results and alert messages: one line per load, numbered for "reply 1-5". */
export function renderShortlist(
  ranked: RankedLoad[],
  locale: BotLocale,
  options: { isMock: boolean; title: string; footer?: string },
): string {
  const copy = copyFor(locale);
  const lines = ranked.map(({ load, analysis, preferred }, index) => {
    const e = analysis.estimate;
    const lane = `${preferred ? "★ " : ""}${laneLabel(load.facts) ?? "?"}`;
    const dh = `DH ${miles(e.deadheadPickupMiles)} (${copy.boardEstimate})`;
    const broker = load.brokerDisplayAllowed && load.facts.brokerCompany ? ` · ${load.facts.brokerCompany}` : "";
    if (!analysis.hasOffer) return `${index + 1}. ${lane} · ${copy.noRatePosted} · ${dh} · ${copy.labels.ask} ${money(analysis.negotiation.ask.rate)}${broker}`;
    return `${index + 1}. ${lane} · ${money(load.facts.grossRate ?? 0)} · ${dh} · ${perMile(e.grossPerTotalMile)} RPM · ${money(e.contributionProfit)} · ${copy.ratings[e.score.rating]}${broker}`;
  });
  const parts = [options.isMock ? copy.searchMockLabel : null, options.title, lines.join("\n")];
  if (ranked.some((item) => item.preferred)) parts.push(copy.preferred);
  parts.push(copy.searchPickHint);
  if (options.footer) parts.push(options.footer);
  return clampForWhatsApp(parts.filter(Boolean).join("\n\n"));
}

/** Two (or three) loads side by side, re-priced on today's profile. */
export function renderComparison(items: { index: number; item: Compared }[], locale: BotLocale): string {
  const copy = copyFor(locale);
  const r = copy.compareRows;
  const head = items.map(({ index, item }) => `#${index} ${item.record.lane ?? miles(item.analysis.estimate.totalMiles)}`);
  const row = (label: string, values: string[]) => `${label}: ${values.join(" | ")}`;
  const a = items.map(({ item }) => item.analysis);
  const lines = [
    copy.compareTitle,
    "",
    ...head,
    "",
    row(r.offer, a.map((x) => money(x.facts.grossRate ?? 0))),
    row(r.totalMiles, a.map((x) => miles(x.estimate.totalMiles))),
    row(r.rpm, a.map((x) => perMile(x.displayRealRpm))),
    row(r.contribution, a.map((x) => money(x.estimate.contributionProfit))),
    row(r.perMile, a.map((x) => perMile(contributionPerMileForDisplay(x)))),
    row(r.afterMaintenance, a.map((x) => money(x.estimate.contributionAfterMaintenance))),
    row(r.score, a.map((x) => `${x.estimate.score.score}`)),
    row(r.rating, a.map((x) => copy.ratings[x.estimate.score.rating])),
    row(r.minimum, a.map((x) => (x.estimate.operationalMinimum.meets === null ? "—" : x.estimate.operationalMinimum.meets ? "✅" : "❌"))),
  ];
  const byMile = [...items].sort((x, y) => y.item.analysis.estimate.contributionProfitPerMile - x.item.analysis.estimate.contributionProfitPerMile);
  const byDollars = [...items].sort((x, y) => y.item.analysis.estimate.contributionProfit - x.item.analysis.estimate.contributionProfit);
  const mileGap = byMile[0].item.analysis.estimate.contributionProfitPerMile - byMile[1].item.analysis.estimate.contributionProfitPerMile;
  const dollarGap = byDollars[0].item.analysis.estimate.contributionProfit - byDollars[1].item.analysis.estimate.contributionProfit;
  lines.push("");
  if (mileGap > 0.004) lines.push(copy.compareMorePerMile(byMile[0].index, perMile(mileGap)));
  if (dollarGap > 0.5 && byDollars[0].index !== byMile[0].index) lines.push(copy.compareMoreDollars(byDollars[0].index, money(Math.round(dollarGap * 100) / 100)));
  return lines.join("\n").trimEnd();
}

export function renderSummary(summary: LoadSummary, found: Insight[], locale: BotLocale): string {
  const copy = copyFor(locale);
  if (!summary.withOffer) return copy.summaryEmpty;
  const tally = (counts: Record<string, number>, names: Record<string, string>) =>
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => `${names[key] ?? key} ${count}`)
      .join(" · ");
  const lines = [
    copy.summaryTitle(summary.days),
    "",
    copy.summaryCounts(summary.analyzed, summary.saved),
    copy.summaryTotals(money(summary.totalGross), miles(summary.totalMiles), perMile(summary.realRpm)),
    copy.summaryContribution(money(summary.totalContribution), perMile(summary.contributionPerMile)),
    `${copy.summaryRatings}: ${tally(summary.ratings, copy.ratings)}`,
  ];
  if (Object.keys(summary.decisions).length) lines.push(`${copy.summaryDecisions}: ${tally(summary.decisions, copy.decisions)}`);
  if (summary.bestLane) lines.push(copy.summaryBestLane(summary.bestLane.lane, perMile(summary.bestLane.contributionPerMile), summary.bestLane.loads));
  const insightLines = found.map((insight) => {
    switch (insight.kind) {
      case "DEADHEAD_COST": return `• ${copy.insightDeadhead(pct(insight.warnPct, 0), perMile(insight.difference))}`;
      case "COUNTERS_WORK": return `• ${copy.insightCounters(insight.loads, money(insight.averageRaise))}`;
      case "MISSED_MINIMUM": return `• ${copy.insightMissed(insight.count, insight.of, money(insight.averageGap))}`;
    }
  });
  if (!found.some((insight) => insight.kind === "MISSED_MINIMUM") && summary.belowMinimum && summary.belowMinimum.count > 0) {
    lines.push(copy.summaryBelowMinimum(summary.belowMinimum.count, summary.withOffer, money(summary.belowMinimum.averageGap)));
  }
  if (insightLines.length) lines.push("", copy.insightsTitle, ...insightLines);
  lines.push("", `_${copy.summaryNote}_`);
  return lines.join("\n");
}
