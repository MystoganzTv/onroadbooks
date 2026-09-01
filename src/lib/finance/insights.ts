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
}

const usd = (value: number, digits = 0) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);

const rate = (value: number) => usd(value, 2);

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
  } = input;

  const out: RankedInsight[] = [];
  const comparable = previous.loadCount > 0;

  if (summary.loadCount === 0) {
    return [
      {
        id: "empty",
        tone: "neutral",
        priority: 100,
        text: `No loads recorded for ${period.label}. Add a load to see how the truck performed.`,
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
        text: `Profit per mile ${delta >= 0 ? "improved" : "declined"} ${Math.abs(delta).toFixed(1)}% versus ${previousLabel}, ${rate(previous.profitPerMile)} to ${rate(summary.profitPerMile)}.`,
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
        text: `Deadhead ${change > 0 ? "increased" : "fell"} from ${previous.deadheadPct.toFixed(1)}% to ${summary.deadheadPct.toFixed(1)}% of total miles.`,
      });
    }
  }

  if (deadhead.elevated && deadhead.cost > 0) {
    out.push({
      id: "deadhead-cost",
      tone: "warning",
      priority: 80,
      text: `${Math.round(deadhead.deadheadMiles).toLocaleString()} empty miles at ${rate(deadhead.costPerMile)} actual operating cost per mile is about ${usd(deadhead.cost)} of running cost with no load revenue behind it.`,
    });
  }

  /* -- Where the money went ----------------------------------------------- */
  const fuel = categories.find((c) => c.category === "FUEL");
  if (fuel && fuel.share > 0) {
    out.push({
      id: "fuel-share",
      tone: fuel.share > 35 ? "warning" : "neutral",
      priority: 60,
      text: `Fuel was ${fuel.share.toFixed(1)}% of operating expenses this period, ${usd(fuel.amount)} of ${usd(summary.operatingExpenses)}.`,
    });
  }

  if (costBasis.sufficient) {
    out.push({
      id: "cost-split",
      tone: "neutral",
      priority: 55,
      text: `Actual operating cost is ${rate(costBasis.trueCostPerMile)} per mile: ${rate(costBasis.fixedCostPerMile)} fixed and ${rate(costBasis.variableCostPerMile)} variable. Debt service is tracked separately.`,
    });
  }

  /* -- Goal progress and projection --------------------------------------- */
  if (goals.monthlyRevenueTarget > 0 && projection.revenueTarget > 0) {
    if (projection.revenueGap > 0) {
      out.push({
        id: "revenue-gap",
        tone: "neutral",
        priority: 88,
        text: `You need ${usd(projection.revenueGap)} more revenue to reach the ${usd(projection.revenueTarget)} target for ${period.label}.`,
      });
    } else {
      out.push({
        id: "revenue-hit",
        tone: "positive",
        priority: 88,
        text: `Revenue target for ${period.label} is met, ${usd(Math.abs(projection.revenueGap))} past ${usd(projection.revenueTarget)}.`,
      });
    }
  }

  if (projection.applicable && projection.workingDaysRemaining > 0) {
    out.push({
      id: "projection",
      tone: projection.projectedRevenue >= projection.revenueTarget ? "positive" : "warning",
      priority: 86,
      text: `${projection.workingDaysRemaining} working ${projection.workingDaysRemaining === 1 ? "day" : "days"} left at ${usd(projection.revenuePerWorkingDay)} a day projects ${usd(projection.projectedRevenue)} by period end. Projection, not booked revenue.`,
    });
  }

  /* -- Brokers and lanes --------------------------------------------------- */
  const rankedBrokers = brokers.filter((b) => b.qualified && b.broker !== "No broker");
  if (rankedBrokers.length > 0) {
    const best = [...rankedBrokers].sort((a, b) => b.profitPerMile - a.profitPerMile)[0];
    out.push({
      id: "top-broker",
      tone: "positive",
      priority: 70,
      text: `${best.broker} is your most profitable broker per mile this period: ${rate(best.profitPerMile)} across ${best.loadCount} loads, ${usd(best.tripProfit)} of trip profit.`,
    });
  }
  if (rankedBrokers.length >= 2) {
    const weakest = [...rankedBrokers].sort((a, b) => a.profitPerMile - b.profitPerMile)[0];
    const best = [...rankedBrokers].sort((a, b) => b.profitPerMile - a.profitPerMile)[0];
    if (best.broker !== weakest.broker && best.profitPerMile - weakest.profitPerMile > 0.2) {
      out.push({
        id: "weak-broker",
        tone: "warning",
        priority: 50,
        text: `${weakest.broker} pays ${rate(best.profitPerMile - weakest.profitPerMile)} per mile less than ${best.broker} over ${weakest.loadCount} loads.`,
      });
    }
  }

  const qualifiedLanes = lanes.filter((l) => l.qualified);
  if (qualifiedLanes.length >= 2) {
    const bestLane = qualifiedLanes[0];
    const worstLane = qualifiedLanes[qualifiedLanes.length - 1];
    out.push({
      id: "lane-spread",
      tone: "neutral",
      priority: 45,
      text: `${bestLane.label} returns ${rate(bestLane.profitPerMile)} a mile against ${rate(worstLane.profitPerMile)} on ${worstLane.label}.`,
    });
  }

  /* -- Reserves and the truck ---------------------------------------------- */
  if (includeOwnerPlanning && maintenance.coverage !== null && maintenance.upcomingCost > 0) {
    out.push({
      id: "maintenance-coverage",
      tone: maintenance.coverage >= 1 ? "positive" : "warning",
      priority: maintenance.coverage >= 1 ? 40 : 92,
      text: `The maintenance reserve covers about ${maintenance.coverage.toFixed(1)}x the ${usd(maintenance.upcomingCost)} of service currently due.`,
    });
  }
  if (maintenance.overdueCount > 0) {
    out.push({
      id: "maintenance-overdue",
      tone: "warning",
      priority: 95,
      text: `${maintenance.overdueCount} maintenance ${maintenance.overdueCount === 1 ? "item is" : "items are"} past due on the truck.`,
    });
  }

  if (includeOwnerPlanning && ownerPay.safeToPay > 0) {
    out.push({
      id: "take-home",
      tone: ownerPay.takeHomeRate >= 30 ? "positive" : "neutral",
      priority: 65,
      text: `After debt payments and ${usd(ownerPay.reserveTotal)} of suggested set-asides, ${usd(ownerPay.safeToPay)} is available to you, or ${ownerPay.takeHomeRate.toFixed(1)}c of every collected dollar.`.replace(
        "c of",
        " cents of",
      ),
    });
  }

  if (summary.accountsReceivable > 0) {
    out.push({
      id: "outstanding",
      tone: "warning",
      priority: 62,
      text: includeOwnerPlanning
        ? `${usd(summary.accountsReceivable)} of what you earned is still owed and cannot become available cash until collected.`
        : `${usd(summary.accountsReceivable)} of what you earned is still owed and has not been collected.`,
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
        text: `Repairs were ${usd(repairs.amount)}, ${share.toFixed(1)}% of spend, across ${repairs.count} ${repairs.count === 1 ? "entry" : "entries"}.`,
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
        text: `Cost per mile ${delta <= 0 ? "fell" : "rose"} ${Math.abs(delta).toFixed(1)}% versus ${previousLabel}, ${rate(previous.costPerMile)} to ${rate(summary.costPerMile)}.`,
      });
    }
  }

  return out.sort((a, b) => b.priority - a.priority);
}

/** Total reserved money stated in one line, for the reserves panel. */
export function reserveSummaryLine(total: number, months: number): string {
  return `${usd(roundMoney(total))} set aside across ${months} ${months === 1 ? "bucket" : "buckets"}.`;
}
