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
 *   Overhead         = total miles x overhead cost per mile
 *
 * `overheadCostPerMile` is the truck's own historical cost per mile with
 * fuel, tolls, dispatch and factoring removed -- those four are entered
 * explicitly above, and charging them twice is the classic way a load
 * calculator lies to you. What is left is the truck note, insurance,
 * parking, permits, maintenance, repairs and the rest of the overhead every
 * mile has to carry.
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
  /** Fuel + tolls + dispatch + factoring + other. What the trip itself costs. */
  tripCost: number;
  /** Trip cost plus the overhead those miles have to carry. */
  totalCost: number;
  profit: number;
  profitPerMile: number;
  profitMargin: number;
  costPerMile: number;
  breakEvenRate: number;
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

  const tripCost = roundMoney(fuelCost + tolls + dispatch + factoring + otherCost);
  const totalCost = roundMoney(tripCost + overhead);
  const profit = roundMoney(grossRate - totalCost);
  const profitPerMile = div(profit, totalMiles);
  const profitMargin = div(profit, grossRate) * 100;
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
    {
      key: "overhead",
      label: "Truck operating cost",
      amount: overhead,
      note: `${totalMiles.toLocaleString()} mi at $${input.overheadPerMile.toFixed(2)}/mi overhead`,
    },
  ].filter((line) => line.amount > 0 || line.key === "fuel" || line.key === "overhead");

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
    tripCost,
    totalCost,
    profit,
    profitPerMile,
    profitMargin,
    costPerMile: div(totalCost, totalMiles),
    breakEvenRate: totalCost,
    lines,
    score: calculateLoadScore(
      { profitPerMile, profitMargin, deadheadPct },
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
  /** What the owner wants to clear, per total mile. */
  targetProfitPerMile: number;
}

export interface RateTier {
  key: "breakeven" | "minimum" | "good" | "great" | "target";
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
  /** Costs that do not move with the rate. Dispatch and factoring do. */
  fixedTripCost: number;
  costPerMile: number;
  /** Combined dispatch + factoring share of gross, as a fraction (0.075). */
  grossFeeRate: number;
  /** Dispatch + factoring entered as flat dollars rather than a percentage. */
  flatFees: number;
  tiers: RateTier[];
  valid: boolean;
  /** Set when fees are configured at 100% or more and no rate can work. */
  impossible: boolean;
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

  const flatFees = roundMoney(
    (input.dispatchMode === "AMOUNT" ? Math.max(0, input.dispatchValue) : 0) +
      (input.factoringMode === "AMOUNT" ? Math.max(0, input.factoringValue) : 0),
  );
  const grossFeeRate =
    (input.dispatchMode === "PCT" ? Math.max(0, input.dispatchValue) : 0) / 100 +
    (input.factoringMode === "PCT" ? Math.max(0, input.factoringValue) : 0) / 100;

  const fixedTripCost = roundMoney(fuelCost + tolls + otherCost + overhead + flatFees);
  const impossible = grossFeeRate >= 1;

  const rateFor = (profitPerMile: number): number => {
    if (impossible || totalMiles <= 0) return 0;
    return roundMoney((fixedTripCost + profitPerMile * totalMiles) / (1 - grossFeeRate));
  };

  const tierDefs: { key: RateTier["key"]; label: string; ppm: number; description: string }[] = [
    {
      key: "breakeven",
      label: "Break even",
      ppm: 0,
      description: "Covers fuel, tolls, fees and the truck's overhead. Pays you nothing.",
    },
    {
      key: "minimum",
      label: "Minimum acceptable",
      ppm: thresholds.marginal,
      description: `Clears $${thresholds.marginal.toFixed(2)}/mi -- your MARGINAL floor. Take it if the reload is worth it.`,
    },
    {
      key: "good",
      label: "Good rate",
      ppm: thresholds.good,
      description: `Clears $${thresholds.good.toFixed(2)}/mi -- rates as a GOOD load.`,
    },
    {
      key: "great",
      label: "Great rate",
      ppm: thresholds.great,
      description: `Clears $${thresholds.great.toFixed(2)}/mi -- rates as a GREAT load.`,
    },
    {
      key: "target",
      label: "Your target",
      ppm: input.targetProfitPerMile,
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
    fixedTripCost,
    costPerMile: div(fixedTripCost, totalMiles),
    grossFeeRate,
    flatFees,
    tiers: tierDefs.map((tier) => {
      const rate = rateFor(tier.ppm);
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
