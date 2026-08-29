/**
 * DEADHEAD MONITOR
 * ================
 *
 * Empty miles are a first-class business metric, not a footnote. They cost
 * money in two different ways and the app reports both:
 *
 *   COST         deadhead miles x true cost per mile
 *                What running those miles actually took out of the business.
 *   OPPORTUNITY  deadhead miles x revenue per loaded mile
 *                What those miles would have earned if they had been loaded.
 *
 * The wording is factual, never scolding. Some deadhead is unavoidable and an
 * owner-operator repositioning to a better market is making a decision, not a
 * mistake.
 */

import { div, roundMoney } from "../calculations";
import type { FinancialSettings, PeriodSummary } from "../types";
import type { CostPerMile } from "./cost-per-mile";

export interface DeadheadReport {
  loadedMiles: number;
  deadheadMiles: number;
  totalMiles: number;
  deadheadPct: number;
  warnPct: number;
  elevated: boolean;
  /** Cost per mile the estimate was priced at. */
  costPerMile: number;
  cost: number;
  opportunityRevenue: number;
  /** Revenue per loaded mile minus revenue per total mile. */
  rateDilution: number;
  /** Deadhead cost expressed across every mile driven. */
  dragPerTotalMile: number;
  statement: string;
  /** Miles that would have to be loaded instead to hit the goal. */
  milesToGoal: number;
  goalPct: number | null;
}

export function calculateDeadheadCost(
  summary: PeriodSummary,
  basis: Pick<CostPerMile, "trueCostPerMile" | "sufficient">,
  settings: Pick<FinancialSettings, "deadheadWarnPct">,
  goalMaxDeadheadPct?: number | null,
): DeadheadReport {
  const warnPct = settings.deadheadWarnPct ?? 20;
  // Priced at the cost per mile the card actually SHOWS, to the cent. Using
  // the unrounded rate makes "883 mi x $1.84" fail to equal the total printed
  // beside it, and an owner who checks the multiplication should find it ties.
  const costPerMile = basis.sufficient ? roundMoney(basis.trueCostPerMile) : 0;
  const cost = roundMoney(summary.deadheadMiles * costPerMile);

  const milesToGoal =
    goalMaxDeadheadPct != null && goalMaxDeadheadPct >= 0 && summary.totalMiles > 0
      ? Math.max(
          0,
          Math.round(summary.deadheadMiles - (goalMaxDeadheadPct / 100) * summary.totalMiles),
        )
      : 0;

  return {
    loadedMiles: summary.loadedMiles,
    deadheadMiles: summary.deadheadMiles,
    totalMiles: summary.totalMiles,
    deadheadPct: summary.deadheadPct,
    warnPct,
    elevated: summary.deadheadPct > warnPct,
    costPerMile,
    cost,
    opportunityRevenue: roundMoney(summary.deadheadMiles * summary.revenuePerLoadedMile),
    rateDilution: summary.revenuePerLoadedMile - summary.revenuePerMile,
    dragPerTotalMile: div(cost, summary.totalMiles),
    statement:
      summary.deadheadMiles > 0
        ? `You drove ${Math.round(summary.deadheadMiles).toLocaleString()} miles without generating direct load revenue.`
        : "Every mile in this period was under a load.",
    milesToGoal,
    goalPct: goalMaxDeadheadPct ?? null,
  };
}
