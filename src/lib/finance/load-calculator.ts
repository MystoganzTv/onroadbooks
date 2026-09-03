/**
 * LOAD CALCULATOR
 * ===============
 *
 * Two questions, one cost model.
 *
 *   EVALUATE   "Broker is offering $700 for this. Is it worth running?"
 *   TARGET     "I want $1.50/mile of profit. What do I quote?"
 *
 * The cost model, in the order money leaves:
 *
 *   Total miles      = loaded + deadhead to pickup          (always both)
 *   Fuel             = total miles / MPG x price per gallon
 *   Tolls            = entered
 *   Dispatch         = percent of gross, or a flat amount
 *   Factoring        = percent of gross, or a flat amount
 *   Other            = entered
 *   Allocated ops    = total miles x normalized operating cost per mile
 *   Debt burden      = total miles x debt-service cost per mile (cash only)
 *
 * `overheadCostPerMile` is the truck's own historical cost per mile with
 * fuel, tolls, dispatch and factoring removed -- those four are entered
 * explicitly above, and charging them twice is the classic way a load
 * calculator lies to you. What is left is insurance, parking, permits,
 * maintenance, repairs and the rest of the operating overhead every mile has
 * to carry. Truck-note Debt Service is excluded from operating overhead and
 * displayed in its own cash-burden layer.
 *
 * Deadhead is never optional. A rate is only as good as the miles it took to
 * earn it, and the empty ones are miles.
 */

import { div, roundMoney, type RatingThresholds } from "../calculations";
import { calculateLoadScore, type LoadScore } from "./load-score";

export type FeeMode = "PCT" | "AMOUNT";

export interface LoadEstimateInput {
  grossRate: number;
  loadedMiles: number;
  deadheadMiles: number;
  fuelPrice: number;
  mpg: number;
  tolls: number;
  dispatchMode: FeeMode;
  dispatchValue: number;
  factoringMode: FeeMode;
  factoringValue: number;
  otherCost: number;
  /** Historical overhead per mile. See `overheadCostPerMile`. */
  overheadPerMile: number;
  /** Historical debt-service cash burden; never used by the load rating. */
  debtServicePerMile?: number;
}

export interface CostLineItem {
  key: string;
  label: string;
  amount: number;
  note?: string;
}

export interface LoadEstimate {
  totalMiles: number;
  grossPerLoadedMile: number;
  grossPerTotalMile: number;
  deadheadPct: number;
  gallons: number;
  fuelCost: number;
  tolls: number;
  dispatch: number;
  factoring: number;
  otherCost: number;
  overhead: number;
  debtService: number;
  /** Fuel + tolls + dispatch + factoring + other. What the trip itself costs. */
  tripCost: number;
  directTripCosts: number;
  contributionProfit: number;
  contributionProfitPerMile: number;
  contributionMargin: number;
  allocatedOperatingCosts: number;
  fullyLoadedOperatingProfit: number;
  fullyLoadedOperatingProfitPerMile: number;
  fullyLoadedOperatingMargin: number;
  cashAfterDebtService: number;
  /** Trip cost plus the overhead those miles have to carry. */
  totalCost: number;
  profit: number;
  profitPerMile: number;
  profitMargin: number;
  costPerMile: number;
  breakEvenRate: number;
  operatingBreakEven: number;
  cashBreakEven: number;
  lines: CostLineItem[];
  score: LoadScore;
  /** False when miles or MPG are missing: nothing below can be trusted yet. */
  valid: boolean;
}

function feeAmount(mode: FeeMode, value: number, gross: number): number {
  const safe = Number.isFinite(value) && value > 0 ? value : 0;
  return mode === "PCT" ? roundMoney(gross * (safe / 100)) : roundMoney(safe);
}

export function calculateLoadEstimate(
  input: LoadEstimateInput,
  thresholds: RatingThresholds,
  deadheadWarnPct: number,
): LoadEstimate {
  const loadedMiles = Math.max(0, input.loadedMiles);
  const deadheadMiles = Math.max(0, input.deadheadMiles);
  const totalMiles = loadedMiles + deadheadMiles;
  const grossRate = Math.max(0, input.grossRate);

  const gallons = input.mpg > 0 ? totalMiles / input.mpg : 0;
  const fuelCost = roundMoney(gallons * Math.max(0, input.fuelPrice));
  const tolls = roundMoney(Math.max(0, input.tolls));
  const dispatch = feeAmount(input.dispatchMode, input.dispatchValue, grossRate);
  const factoring = feeAmount(input.factoringMode, input.factoringValue, grossRate);
  const otherCost = roundMoney(Math.max(0, input.otherCost));
  const overhead = roundMoney(totalMiles * Math.max(0, input.overheadPerMile));
  const debtService = roundMoney(totalMiles * Math.max(0, input.debtServicePerMile ?? 0));

  const tripCost = roundMoney(fuelCost + tolls + dispatch + factoring + otherCost);
  const totalCost = roundMoney(tripCost + overhead);
  const contributionProfit = roundMoney(grossRate - tripCost);
  const contributionProfitPerMile = div(contributionProfit, totalMiles);
  const contributionMargin = div(contributionProfit, grossRate) * 100;
  const fullyLoadedOperatingProfit = roundMoney(contributionProfit - overhead);
  const fullyLoadedOperatingProfitPerMile = div(fullyLoadedOperatingProfit, totalMiles);
  const fullyLoadedOperatingMargin = div(fullyLoadedOperatingProfit, grossRate) * 100;
  const cashAfterDebtService = roundMoney(fullyLoadedOperatingProfit - debtService);
  const deadheadPct = div(deadheadMiles, totalMiles) * 100;

  const lines: CostLineItem[] = [
    {
      key: "fuel",
      label: "Fuel",
      amount: fuelCost,
      note:
        input.mpg > 0
          ? `${gallons.toFixed(1)} gal at $${input.fuelPrice.toFixed(2)}/gal, ${input.mpg.toFixed(1)} MPG`
          : "Enter MPG to estimate fuel",
    },
    { key: "tolls", label: "Tolls", amount: tolls },
    {
      key: "dispatch",
      label: "Dispatch",
      amount: dispatch,
      note: input.dispatchMode === "PCT" ? `${input.dispatchValue}% of gross` : "Flat fee",
    },
    {
      key: "factoring",
      label: "Factoring",
      amount: factoring,
      note: input.factoringMode === "PCT" ? `${input.factoringValue}% of gross` : "Flat fee",
    },
    { key: "other", label: "Other costs", amount: otherCost },
  ].filter((line) => line.amount > 0 || line.key === "fuel");

  return {
    totalMiles,
    grossPerLoadedMile: div(grossRate, loadedMiles),
    grossPerTotalMile: div(grossRate, totalMiles),
    deadheadPct,
    gallons,
    fuelCost,
    tolls,
    dispatch,
    factoring,
    otherCost,
    overhead,
    debtService,
    tripCost,
    directTripCosts: tripCost,
    contributionProfit,
    contributionProfitPerMile,
    contributionMargin,
    allocatedOperatingCosts: overhead,
    fullyLoadedOperatingProfit,
    fullyLoadedOperatingProfitPerMile,
    fullyLoadedOperatingMargin,
    cashAfterDebtService,
    totalCost,
    profit: fullyLoadedOperatingProfit,
    profitPerMile: fullyLoadedOperatingProfitPerMile,
    profitMargin: fullyLoadedOperatingMargin,
    costPerMile: div(totalCost, totalMiles),
    breakEvenRate: totalCost,
    operatingBreakEven: totalCost,
    cashBreakEven: roundMoney(totalCost + debtService),
    lines,
    score: calculateLoadScore(
      {
        profitPerMile: contributionProfitPerMile,
        profitMargin: contributionMargin,
        deadheadPct,
      },
      thresholds,
      deadheadWarnPct,
    ),
    valid: totalMiles > 0 && input.mpg > 0,
  };
}

/* ---- What rate should I ask? ------------------------------------------ */

export interface TargetRateInput {
  loadedMiles: number;
  deadheadMiles: number;
  fuelPrice: number;
  mpg: number;
  tolls: number;
  dispatchMode: FeeMode;
  dispatchValue: number;
  factoringMode: FeeMode;
  factoringValue: number;
  otherCost: number;
  overheadPerMile: number;
  debtServicePerMile?: number;
  /** What the owner wants to clear, per total mile. */
  targetProfitPerMile: number;
}

export interface RateTier {
  key: "operatingBreakeven" | "cashBreakeven" | "minimum" | "good" | "great" | "target";
  label: string;
  profitPerMile: number;
  rate: number;
  ratePerLoadedMile: number;
  description: string;
}

export interface TargetRate {
  totalMiles: number;
  gallons: number;
  fuelCost: number;
  tolls: number;
  otherCost: number;
  overhead: number;
  debtService: number;
  /** Costs that do not move with the rate. Dispatch and factoring do. */
  fixedTripCost: number;
  /** Direct costs that do not move with the rate, before allocated overhead. */
  directFixedCost: number;
  costPerMile: number;
  /** Combined dispatch + factoring share of gross, as a fraction (0.075). */
  grossFeeRate: number;
  /** Dispatch + factoring entered as flat dollars rather than a percentage. */
  flatFees: number;
  /** Direct trip costs only. Always available when the trip inputs are valid. */
  directCostBreakEven: number;
  tiers: RateTier[];
  valid: boolean;
  /** Set when fees are configured at 100% or more and no rate can work. */
  impossible: boolean;
}

export type OfferPosition = "GREAT" | "GOOD" | "MARGINAL" | "BELOW_MINIMUM";

export interface OfferComparison {
  position: OfferPosition;
  differenceVsGreat: number;
  /** The threshold the negotiation should aim to settle at. */
  settlementTarget: number | null;
  /** Null when the existing offer already meets or exceeds GREAT. */
  suggestedCounteroffer: number | null;
}

export const QUOTE_ROUNDING_INCREMENT = 25;
export const QUOTE_CUSHION_PCT = 0.03;
export const MIN_QUOTE_CUSHION = 25;

/**
 * A deterministic opening anchor: add 3% (at least $25), then round UP to
 * the next $25. The current offer is a hard floor and can never be rounded
 * down by the suggestion.
 */
export function suggestedOpeningQuote(
  settlementTarget: number,
  currentOffer = 0,
): number {
  const safeTarget = Math.max(0, settlementTarget);
  const safeOffer = Math.max(0, currentOffer);
  const cushion = Math.max(MIN_QUOTE_CUSHION, safeTarget * QUOTE_CUSHION_PCT);
  const rounded =
    Math.ceil((safeTarget + cushion) / QUOTE_ROUNDING_INCREMENT) *
    QUOTE_ROUNDING_INCREMENT;
  return roundMoney(Math.max(safeOffer, rounded));
}

/** Compare a posted broker offer with the contribution-profit rate bands. */
export function compareOfferToThresholds(
  currentOffer: number,
  rates: { minimum: number; good: number; great: number },
): OfferComparison {
  const offer = Math.max(0, currentOffer);
  const differenceVsGreat = roundMoney(offer - rates.great);

  if (offer >= rates.great) {
    return {
      position: "GREAT",
      differenceVsGreat,
      settlementTarget: null,
      suggestedCounteroffer: null,
    };
  }

  const position: OfferPosition = offer >= rates.good
    ? "GOOD"
    : offer >= rates.minimum
      ? "MARGINAL"
      : "BELOW_MINIMUM";
  const settlementTarget = position === "GOOD" ? rates.great : rates.good;

  return {
    position,
    differenceVsGreat,
    settlementTarget,
    suggestedCounteroffer: suggestedOpeningQuote(settlementTarget, offer),
  };
}

/**
 * Solving for the rate.
 *
 * Dispatch and factoring are usually a cut of the rate, so they move when the
 * rate moves and cannot simply be added to the cost. With
 *
 *   f = dispatch% + factoring%   (as a fraction)
 *   C = fuel + tolls + other + overhead + any FLAT dispatch/factoring fees
 *   P = target profit = target profit per mile x total miles
 *
 * the rate has to satisfy   R - C - fR = P,   which gives
 *
 *   R = (C + P) / (1 - f)
 *
 * That single expression produces every tier below; only P changes.
 */
export function calculateTargetRate(
  input: TargetRateInput,
  thresholds: RatingThresholds,
): TargetRate {
  const loadedMiles = Math.max(0, input.loadedMiles);
  const totalMiles = loadedMiles + Math.max(0, input.deadheadMiles);
  const gallons = input.mpg > 0 ? totalMiles / input.mpg : 0;
  const fuelCost = roundMoney(gallons * Math.max(0, input.fuelPrice));
  const tolls = roundMoney(Math.max(0, input.tolls));
  const otherCost = roundMoney(Math.max(0, input.otherCost));
  const overhead = roundMoney(totalMiles * Math.max(0, input.overheadPerMile));
  const debtService = roundMoney(totalMiles * Math.max(0, input.debtServicePerMile ?? 0));

  const flatFees = roundMoney(
    (input.dispatchMode === "AMOUNT" ? Math.max(0, input.dispatchValue) : 0) +
      (input.factoringMode === "AMOUNT" ? Math.max(0, input.factoringValue) : 0),
  );
  const grossFeeRate =
    (input.dispatchMode === "PCT" ? Math.max(0, input.dispatchValue) : 0) / 100 +
    (input.factoringMode === "PCT" ? Math.max(0, input.factoringValue) : 0) / 100;

  const directFixedCost = roundMoney(fuelCost + tolls + otherCost + flatFees);
  const fixedTripCost = roundMoney(directFixedCost + overhead);
  const impossible = grossFeeRate >= 1;

  const rateFor = (costAndProfit: number): number => {
    if (impossible || totalMiles <= 0) return 0;
    return roundMoney(costAndProfit / (1 - grossFeeRate));
  };

  const tierDefs: {
    key: RateTier["key"];
    label: string;
    ppm: number;
    numerator: number;
    description: string;
  }[] = [
    {
      key: "operatingBreakeven",
      label: "Operating break-even",
      ppm: 0,
      numerator: directFixedCost + overhead,
      description: "Covers direct trip costs and allocated operating costs. Excludes debt service.",
    },
    {
      key: "cashBreakeven",
      label: "Cash break-even",
      ppm: 0,
      numerator: directFixedCost + overhead + debtService,
      description: "Covers operating break-even plus the separately allocated debt-service burden.",
    },
    {
      key: "minimum",
      label: "Minimum acceptable",
      ppm: thresholds.marginal,
      numerator: directFixedCost + thresholds.marginal * totalMiles,
      description: `Contributes $${thresholds.marginal.toFixed(2)}/mi after direct trip costs -- your MARGINAL floor.`,
    },
    {
      key: "good",
      label: "Good rate",
      ppm: thresholds.good,
      numerator: directFixedCost + thresholds.good * totalMiles,
      description: `Contributes $${thresholds.good.toFixed(2)}/mi after direct trip costs -- rates as GOOD.`,
    },
    {
      key: "great",
      label: "Great rate",
      ppm: thresholds.great,
      numerator: directFixedCost + thresholds.great * totalMiles,
      description: `Contributes $${thresholds.great.toFixed(2)}/mi after direct trip costs -- rates as GREAT.`,
    },
    {
      key: "target",
      label: "Your target",
      ppm: input.targetProfitPerMile,
      numerator: directFixedCost + overhead + input.targetProfitPerMile * totalMiles,
      description: `Clears the $${input.targetProfitPerMile.toFixed(2)}/mi you asked for.`,
    },
  ];

  return {
    totalMiles,
    gallons,
    fuelCost,
    tolls,
    otherCost,
    overhead,
    debtService,
    directFixedCost,
    fixedTripCost,
    costPerMile: div(fixedTripCost, totalMiles),
    grossFeeRate,
    flatFees,
    directCostBreakEven: rateFor(directFixedCost),
    tiers: tierDefs.map((tier) => {
      const rate = rateFor(tier.numerator);
      return {
        key: tier.key,
        label: tier.label,
        profitPerMile: tier.ppm,
        rate,
        ratePerLoadedMile: div(rate, loadedMiles),
        description: tier.description,
      } satisfies RateTier;
    }),
    valid: totalMiles > 0 && input.mpg > 0 && !impossible,
    impossible,
  };
}
