/**
 * INSIGHTS ENGINE
 * ===============
 *
 * Deterministic rules over the same numbers already on screen. No model, no
 * generated prose, nothing that cannot be reproduced by hand from the ledger.
 *
 * Two hard rules:
 *
 *   1. Never fabricate. Every rule states the data it needs and produces
 *      nothing when that data is not there. A comparison needs a previous
 *      period with loads in it; a broker claim needs a broker with more than
 *      one load; a coverage ratio needs a priced service.
 *   2. Never editorialise. The insight states what happened and, where it is
 *      arithmetic, what it would take to change it.
 *
 * Insights carry a priority so the dashboard can show the most useful few
 * without the list being ordered by accident of evaluation.
 */

import { div, pctChange, roundMoney } from "../calculations";
import type {
  CategoryTotal,
  FinancialGoal,
  Insight,
  PeriodSummary,
} from "../types";
import type { Period } from "../periods";
import type { BrokerScore } from "./brokers";
import type { CostPerMile } from "./cost-per-mile";
import type { DeadheadReport } from "./deadhead";
import type { LanePerformance } from "./lanes";
import type { MaintenanceHealth } from "./maintenance-health";
import type { OwnerPay } from "./owner-pay";
import type { Projection } from "./goals";
import type { AppLocale } from "../i18n";
import { getWebDictionary, interpolate } from "../i18n/dictionaries";
import { localeTag } from "../i18n-format";

export interface RankedInsight extends Insight {
  /** Higher shows first. */
  priority: number;
}

export interface InsightInput {
  period: Period;
  summary: PeriodSummary;
  previous: PeriodSummary;
  previousLabel: string;
  categories: CategoryTotal[];
  costBasis: CostPerMile;
  deadhead: DeadheadReport;
  ownerPay: OwnerPay;
  goals: FinancialGoal;
  projection: Projection;
  brokers: BrokerScore[];
  lanes: LanePerformance[];
  maintenance: MaintenanceHealth;
  /** Owner-only planning language and reserve coverage. */
  includeOwnerPlanning?: boolean;
  /**
   * The `cockpit` capability. Without it the panel still explains the
   * ledger, but it must not restate in prose what the plan gates on the
   * screen above it: brokers, lanes, the projection, priced deadhead and
   * Safe to Pay.
   */
  includeCockpit?: boolean;
  locale?: AppLocale;
}

const usd = (value: number, digits = 0, locale: AppLocale = "en") =>
  new Intl.NumberFormat(localeTag(locale), {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);

export function buildCockpitInsights(input: InsightInput): RankedInsight[] {
  const {
    period,
    summary,
    previous,
    previousLabel,
    categories,
    costBasis,
    deadhead,
    ownerPay,
    goals,
    projection,
    brokers,
    lanes,
    maintenance,
    includeOwnerPlanning = true,
    includeCockpit = true,
    locale = "en",
  } = input;
  const copy = getWebDictionary(locale).dashboard;
  const money = (value: number, digits = 0) => usd(value, digits, locale);
  const rate = (value: number) => money(value, 2);

  const out: RankedInsight[] = [];
  const comparable = previous.loadCount > 0;

  if (summary.loadCount === 0) {
    return [
      {
        id: "empty",
        tone: "neutral",
        priority: 100,
        text: interpolate(copy.insightEmpty, { period: period.label }),
      },
    ];
  }

  /* -- Operating Profit per mile against the previous window -------------- */
  if (comparable && previous.profitPerMile !== 0) {
    const delta = pctChange(summary.profitPerMile, previous.profitPerMile);
    if (Math.abs(delta) >= 1) {
      out.push({
        id: "ppm-trend",
        tone: delta >= 0 ? "positive" : "negative",
        priority: 90,
        text: interpolate(copy.insightProfitTrend, { direction: delta >= 0 ? copy.improved : copy.declined, percent: Math.abs(delta).toFixed(1), previous: previousLabel, from: rate(previous.profitPerMile), to: rate(summary.profitPerMile) }),
      });
    }
  }

  /* -- Deadhead movement -------------------------------------------------- */
  if (comparable && previous.totalMiles > 0 && summary.totalMiles > 0) {
    const change = summary.deadheadPct - previous.deadheadPct;
    if (Math.abs(change) >= 1) {
      out.push({
        id: "deadhead-trend",
        tone: change <= 0 ? "positive" : deadhead.elevated ? "warning" : "neutral",
        priority: 85,
        text: interpolate(copy.insightDeadheadTrend, { direction: change > 0 ? copy.increased : copy.fell, from: previous.deadheadPct.toFixed(1), to: summary.deadheadPct.toFixed(1) }),
      });
    }
  }

  if (includeCockpit && deadhead.elevated && deadhead.cost > 0) {
    out.push({
      id: "deadhead-cost",
      tone: "warning",
      priority: 80,
      text: interpolate(copy.insightDeadheadCost, { miles: Math.round(deadhead.deadheadMiles).toLocaleString(localeTag(locale)), rate: rate(deadhead.costPerMile), cost: money(deadhead.cost) }),
    });
  }

  /* -- Where the money went ----------------------------------------------- */
  const fuel = categories.find((c) => c.category === "FUEL");
  if (fuel && fuel.share > 0) {
    out.push({
      id: "fuel-share",
      tone: fuel.share > 35 ? "warning" : "neutral",
      priority: 60,
      text: interpolate(copy.insightFuelShare, { percent: fuel.share.toFixed(1), amount: money(fuel.amount), total: money(summary.operatingExpenses) }),
    });
  }

  if (costBasis.sufficient) {
    out.push({
      id: "cost-split",
      tone: "neutral",
      priority: 55,
      text: interpolate(copy.insightCostSplit, { total: rate(costBasis.trueCostPerMile), fixed: rate(costBasis.fixedCostPerMile), variable: rate(costBasis.variableCostPerMile) }),
    });
  }

  /* -- Goal progress and projection --------------------------------------- */
  if (includeCockpit && goals.monthlyRevenueTarget > 0 && projection.revenueTarget > 0) {
    if (projection.revenueGap > 0) {
      out.push({
        id: "revenue-gap",
        tone: "neutral",
        priority: 88,
        text: interpolate(copy.insightRevenueGap, { amount: money(projection.revenueGap), target: money(projection.revenueTarget), period: period.label }),
      });
    } else {
      out.push({
        id: "revenue-hit",
        tone: "positive",
        priority: 88,
        text: interpolate(copy.insightRevenueHit, { period: period.label, amount: money(Math.abs(projection.revenueGap)), target: money(projection.revenueTarget) }),
      });
    }
  }

  if (includeCockpit && projection.applicable && projection.workingDaysRemaining > 0) {
    out.push({
      id: "projection",
      tone: projection.projectedRevenue >= projection.revenueTarget ? "positive" : "warning",
      priority: 86,
      text: interpolate(copy.insightProjection, { days: projection.workingDaysRemaining, unit: projection.workingDaysRemaining === 1 ? copy.day : copy.days, daily: money(projection.revenuePerWorkingDay), projected: money(projection.projectedRevenue) }),
    });
  }

  /* -- Brokers and lanes --------------------------------------------------- */
  const rankedBrokers = brokers.filter((b) => b.qualified && b.broker !== "No broker");
  if (includeCockpit && rankedBrokers.length > 0) {
    const best = [...rankedBrokers].sort((a, b) => b.profitPerMile - a.profitPerMile)[0];
    out.push({
      id: "top-broker",
      tone: "positive",
      priority: 70,
      text: interpolate(copy.insightTopBroker, { broker: best.broker, rate: rate(best.profitPerMile), count: best.loadCount, profit: money(best.tripProfit) }),
    });
  }
  if (includeCockpit && rankedBrokers.length >= 2) {
    const weakest = [...rankedBrokers].sort((a, b) => a.profitPerMile - b.profitPerMile)[0];
    const best = [...rankedBrokers].sort((a, b) => b.profitPerMile - a.profitPerMile)[0];
    if (best.broker !== weakest.broker && best.profitPerMile - weakest.profitPerMile > 0.2) {
      out.push({
        id: "weak-broker",
        tone: "warning",
        priority: 50,
        text: interpolate(copy.insightWeakBroker, { weakest: weakest.broker, difference: rate(best.profitPerMile - weakest.profitPerMile), best: best.broker, count: weakest.loadCount }),
      });
    }
  }

  const qualifiedLanes = lanes.filter((l) => l.qualified);
  if (includeCockpit && qualifiedLanes.length >= 2) {
    const bestLane = qualifiedLanes[0];
    const worstLane = qualifiedLanes[qualifiedLanes.length - 1];
    out.push({
      id: "lane-spread",
      tone: "neutral",
      priority: 45,
      text: interpolate(copy.insightLaneSpread, { best: bestLane.label, bestRate: rate(bestLane.profitPerMile), worstRate: rate(worstLane.profitPerMile), worst: worstLane.label }),
    });
  }

  /* -- Reserves and the truck ---------------------------------------------- */
  if (includeCockpit && includeOwnerPlanning && maintenance.coverage !== null && maintenance.upcomingCost > 0) {
    out.push({
      id: "maintenance-coverage",
      tone: maintenance.coverage >= 1 ? "positive" : "warning",
      priority: maintenance.coverage >= 1 ? 40 : 92,
      text: interpolate(copy.insightMaintenanceCoverage, { coverage: maintenance.coverage.toFixed(1), amount: money(maintenance.upcomingCost) }),
    });
  }
  if (maintenance.overdueCount > 0) {
    out.push({
      id: "maintenance-overdue",
      tone: "warning",
      priority: 95,
      text: interpolate(copy.insightMaintenanceOverdue, { count: maintenance.overdueCount, unit: maintenance.overdueCount === 1 ? copy.itemIs : copy.itemsAre }),
    });
  }

  if (includeCockpit && includeOwnerPlanning && ownerPay.safeToPay > 0) {
    out.push({
      id: "take-home",
      tone: ownerPay.takeHomeRate >= 30 ? "positive" : "neutral",
      priority: 65,
      text: interpolate(copy.insightTakeHome, { reserves: money(ownerPay.reserveTotal), available: money(ownerPay.safeToPay), cents: ownerPay.takeHomeRate.toFixed(1) }),
    });
  }

  if (summary.accountsReceivable > 0) {
    out.push({
      id: "outstanding",
      tone: "warning",
      priority: 62,
      text: includeOwnerPlanning
        ? interpolate(copy.insightOutstandingOwner, { amount: money(summary.accountsReceivable) })
        : interpolate(copy.insightOutstanding, { amount: money(summary.accountsReceivable) }),
    });
  }

  const repairs = categories.find((c) => c.category === "REPAIRS");
  if (repairs && repairs.amount > 0 && summary.operatingExpenses > 0) {
    const share = div(repairs.amount, summary.operatingExpenses) * 100;
    if (share >= 12) {
      out.push({
        id: "repairs",
        tone: "warning",
        priority: 58,
        text: interpolate(copy.insightRepairs, { amount: money(repairs.amount), percent: share.toFixed(1), count: repairs.count, unit: repairs.count === 1 ? copy.entry : copy.entries }),
      });
    }
  }

  if (comparable && previous.operatingExpenses > 0) {
    const delta = pctChange(summary.costPerMile, previous.costPerMile);
    if (Math.abs(delta) >= 5 && summary.totalMiles > 0 && previous.totalMiles > 0) {
      out.push({
        id: "cpm-trend",
        tone: delta <= 0 ? "positive" : "warning",
        priority: 72,
        text: interpolate(copy.insightCostTrend, { direction: delta <= 0 ? copy.fell : copy.rose, percent: Math.abs(delta).toFixed(1), previous: previousLabel, from: rate(previous.costPerMile), to: rate(summary.costPerMile) }),
      });
    }
  }

  return out.sort((a, b) => b.priority - a.priority);
}

/** Total reserved money stated in one line, for the reserves panel. */
export function reserveSummaryLine(total: number, months: number): string {
  return `${usd(roundMoney(total))} set aside across ${months} ${months === 1 ? "bucket" : "buckets"}.`;
}
