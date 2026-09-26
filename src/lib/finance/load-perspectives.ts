/**
 * LOAD PROFITABILITY (owner-operator)
 * ===================================
 *
 * OnRoad Books is built for the owner-operator: the owner drives the truck,
 * so no driver wage sits between the load and the business. One view answers
 * "what did this load leave the business?":
 *
 *   Gross Revenue
 *   - Direct Trip Costs            fuel, tolls, dispatch, factoring, other
 *   = Contribution Profit          per total mile and as a margin
 *   - Allocated Operating Costs    trailing cost per mile x total miles
 *   = Estimated Net Business Profit
 *
 * Debt service is shown beside it, never subtracted. Drivers are kept only to
 * record who ran a load and what they earned (the Drivers page); their pay is
 * not a cost of the load (ADR 0031).
 *
 * This module only regroups numbers the ledger already produces --
 * `tripExpenseLines` for the trip, the trailing cost basis for allocated
 * operating costs -- so nothing is computed twice or from a second source.
 * Per-mile figures always divide by TOTAL miles (loaded + deadhead). Loaded
 * RPM is kept as the freight-market rate a broker quotes, and only that.
 */

import { div, roundMoney, type TripExpenseLine } from "../calculations";

export interface LoadProfitabilityInput {
  grossRevenue: number;
  loadedMiles: number;
  deadheadMiles: number;
  /** Every trip cost line (see `tripExpenseLines`). */
  lines: TripExpenseLine[];
  /** Operating cost per mile left after direct trip costs (`overheadCostPerMile`). */
  allocatedCostPerMile: number;
  /**
   * False when the cost basis has too few miles to allocate from. Net profit
   * is then unknown -- not equal to contribution -- and must say so.
   */
  allocationAvailable?: boolean;
  /** Debt service per mile: a cash burden, never part of profit. */
  debtServicePerMile: number;
}

export interface LoadProfitability {
  grossRevenue: number;
  grossRpm: number;
  loadedRpm: number;
  loadedMiles: number;
  deadheadMiles: number;
  totalMiles: number;
  /** Fuel, tolls, dispatch, factoring and other trip costs. */
  directTripCosts: number;
  contributionProfit: number;
  contributionPerMile: number;
  /** Percent of gross revenue. */
  contributionMargin: number;
  allocatedOperatingCosts: number;
  /** See `LoadProfitabilityInput.allocationAvailable`. */
  allocationAvailable: boolean;
  estimatedNetBusinessProfit: number;
  netProfitPerMile: number;
  /** Shown beside, never subtracted from, business profit. */
  debtServiceBurden: number;
}

export function buildLoadProfitability(input: LoadProfitabilityInput): LoadProfitability {
  const loadedMiles = Math.max(0, input.loadedMiles || 0);
  const deadheadMiles = Math.max(0, input.deadheadMiles || 0);
  const totalMiles = loadedMiles + deadheadMiles;
  const grossRevenue = input.grossRevenue || 0;

  const directTripCosts = roundMoney(input.lines.reduce((total, line) => total + line.amount, 0));
  const contributionProfit = roundMoney(grossRevenue - directTripCosts);
  const allocatedOperatingCosts = roundMoney(totalMiles * Math.max(0, input.allocatedCostPerMile || 0));
  const estimatedNetBusinessProfit = roundMoney(contributionProfit - allocatedOperatingCosts);

  return {
    grossRevenue,
    grossRpm: div(grossRevenue, totalMiles),
    loadedRpm: div(grossRevenue, loadedMiles),
    loadedMiles,
    deadheadMiles,
    totalMiles,
    directTripCosts,
    contributionProfit,
    contributionPerMile: div(contributionProfit, totalMiles),
    contributionMargin: div(contributionProfit, grossRevenue) * 100,
    allocatedOperatingCosts,
    allocationAvailable: input.allocationAvailable ?? true,
    estimatedNetBusinessProfit,
    netProfitPerMile: div(estimatedNetBusinessProfit, totalMiles),
    debtServiceBurden: roundMoney(totalMiles * Math.max(0, input.debtServicePerMile || 0)),
  };
}
