/**
 * LOAD PROFITABILITY, THREE PERSPECTIVES
 * ======================================
 *
 * One load answers three different questions, and mixing them is how a
 * profitability screen starts lying:
 *
 *   BUSINESS        "Was this load profitable for the company after paying
 *                    the driver?" Driver pay is always a cost here, even
 *                    when the owner drives -- it is what answers "would this
 *                    load still work with a hired driver?"
 *   DRIVER          "What did the driver earn for doing it?" Compensation per
 *                    mile (and per hour, once hours are recorded). Never the
 *                    business's profit.
 *   OWNER-OPERATOR  "What did the owner receive, when the owner drove?"
 *                    Driver compensation plus business contribution, shown as
 *                    two parts. It is NOT profit: half of it is pay for labour.
 *
 * This module only regroups numbers the ledger already produces --
 * `tripExpenseLines` for the trip, the trailing cost basis for allocated
 * operating costs -- so nothing is computed twice or from a second source.
 *
 * Per-mile figures always divide by TOTAL miles (loaded + deadhead). Loaded
 * RPM is kept as the freight-market rate a broker quotes, and only that.
 */

import { div, roundMoney, type TripExpenseLine } from "../calculations";

export interface LoadProfitabilityInput {
  grossRevenue: number;
  loadedMiles: number;
  deadheadMiles: number;
  /** Every trip cost line, driver pay included (see `tripExpenseLines`). */
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
  /** True only when the load's assigned driver is marked as the owner. */
  driverIsOwner: boolean;
  /** Recorded trip hours, when known. The product does not record them yet. */
  tripHours?: number | null;
}

export interface BusinessView {
  grossRevenue: number;
  grossRpm: number;
  loadedRpm: number;
  loadedMiles: number;
  deadheadMiles: number;
  totalMiles: number;
  /** Fuel, tolls, dispatch, factoring and other trip costs; not driver pay. */
  directTripCosts: number;
  driverCompensation: number;
  /** Driver pay is the expected amount from the driver's terms, not yet paid. */
  driverCompensationExpected: boolean;
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

export interface DriverView {
  driverCompensation: number;
  expected: boolean;
  payPerTotalMile: number;
  payPerLoadedMile: number;
  totalMiles: number;
  loadedMiles: number;
  tripHours: number | null;
  payPerHour: number | null;
}

export interface OwnerOperatorView {
  driverCompensation: number;
  businessContribution: number;
  /** Compensation + contribution. Not profit -- see the module comment. */
  ownerEconomicBenefit: number;
  estimatedNetBusinessProfit: number;
}

export interface LoadProfitability {
  business: BusinessView;
  driver: DriverView;
  /** Null unless the load's driver is explicitly the owner. */
  ownerOperator: OwnerOperatorView | null;
  /** No driver pay on the load: labour is missing from the business view. */
  noDriverPay: boolean;
}

export function buildLoadProfitability(input: LoadProfitabilityInput): LoadProfitability {
  const loadedMiles = Math.max(0, input.loadedMiles || 0);
  const deadheadMiles = Math.max(0, input.deadheadMiles || 0);
  const totalMiles = loadedMiles + deadheadMiles;
  const grossRevenue = input.grossRevenue || 0;

  const driverLine = input.lines.find((line) => line.key === "driverPay");
  const driverCompensation = roundMoney(driverLine?.amount ?? 0);
  const directTripCosts = roundMoney(
    input.lines.filter((line) => line.key !== "driverPay").reduce((total, line) => total + line.amount, 0),
  );
  const contributionProfit = roundMoney(grossRevenue - directTripCosts - driverCompensation);
  const allocatedOperatingCosts = roundMoney(totalMiles * Math.max(0, input.allocatedCostPerMile || 0));
  const estimatedNetBusinessProfit = roundMoney(contributionProfit - allocatedOperatingCosts);
  const tripHours = input.tripHours && input.tripHours > 0 ? input.tripHours : null;

  const business: BusinessView = {
    grossRevenue,
    grossRpm: div(grossRevenue, totalMiles),
    loadedRpm: div(grossRevenue, loadedMiles),
    loadedMiles,
    deadheadMiles,
    totalMiles,
    directTripCosts,
    driverCompensation,
    driverCompensationExpected: Boolean(driverLine?.estimated),
    contributionProfit,
    contributionPerMile: div(contributionProfit, totalMiles),
    contributionMargin: div(contributionProfit, grossRevenue) * 100,
    allocatedOperatingCosts,
    allocationAvailable: input.allocationAvailable ?? true,
    estimatedNetBusinessProfit,
    netProfitPerMile: div(estimatedNetBusinessProfit, totalMiles),
    debtServiceBurden: roundMoney(totalMiles * Math.max(0, input.debtServicePerMile || 0)),
  };

  return {
    business,
    driver: {
      driverCompensation,
      expected: business.driverCompensationExpected,
      payPerTotalMile: div(driverCompensation, totalMiles),
      payPerLoadedMile: div(driverCompensation, loadedMiles),
      totalMiles,
      loadedMiles,
      tripHours,
      payPerHour: tripHours ? div(driverCompensation, tripHours) : null,
    },
    ownerOperator: input.driverIsOwner
      ? {
          driverCompensation,
          businessContribution: contributionProfit,
          ownerEconomicBenefit: roundMoney(driverCompensation + contributionProfit),
          estimatedNetBusinessProfit,
        }
      : null,
    noDriverPay: driverCompensation <= 0,
  };
}
