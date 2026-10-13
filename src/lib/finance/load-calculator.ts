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
 *   Total miles      = loaded + deadhead to pickup + deadhead after delivery
 *   Fuel             = total miles / MPG x price per gallon
 *   Tolls            = entered
 *   Dispatch         = percent of gross, or a flat amount
 *   Factoring        = percent of gross, or a flat amount
 *   Other            = entered
 *   Driver pay       = percent of gross, or a flat amount -- a business cost
 *                      even when the owner drives (ADR-0028)
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
 *
 * THE OWNER'S VIEW OF ONE LOAD (what the calculator page shows)
 *
 *   Loaded RPM        = gross / loaded miles           the broker's number
 *   Real RPM          = gross / total miles            the number that decides
 *   Gross
 *   - Direct trip costs   fuel, tolls, dispatch, factoring, other (cash)
 *   = Contribution profit                              -> rating + score
 *   - Maintenance allocation  maintenance $/mi x total miles (NOT cash, NOT a
 *                             direct trip cost -- its own layer)
 *   = Contribution after maintenance
 *
 * Monthly business expenses (insurance, ELD, DAT, truck note...) are never
 * subtracted from a single load here; the page shows them as reference only.
 *
 * TWO DIFFERENT FLOORS, KEPT APART ON PURPOSE
 *
 *   Profitability floor  the MARGINAL rating threshold: contribution per total
 *                        mile, solved for the gross that reaches it.
 *   Operational minimum  the owner's own rule on GROSS per TOTAL mile
 *                        (e.g. $1.80 x 1,887 mi = $3,396.60).
 *
 * The operational minimum is a GATE, not a fifth input to the score. The
 * GREAT/GOOD/MARGINAL/BAD rating is the same `rateLoad()` used on every saved
 * load, broker and lane; folding a revenue rule into it would make this page
 * call a load BAD that the Loads page calls MARGINAL once saved, and would
 * hide WHICH rule failed. Both verdicts are returned and shown side by side.
 */

import { div, roundMoney, type RatingThresholds } from "../calculations";
import { calculateLoadScore, type LoadScore } from "./load-score";

export type FeeMode = "PCT" | "AMOUNT";

/**
 * Default operational floor for a straight box truck: gross per TOTAL mile,
 * deadhead included. Editable in the calculator; 0 turns the gate off.
 */
export const DEFAULT_MIN_RATE_PER_TOTAL_MILE = 1.8;
/** Default maintenance allocation per TOTAL mile. Editable; 0 hides the layer. */
export const DEFAULT_MAINTENANCE_PER_MILE = 0.2;

/** Finite and positive, or 0. Keeps NaN, Infinity and negatives out of money math. */
function nonNegative(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

export interface OperationalMinimum {
  /** The owner's floor in gross dollars per total mile. 0 = not set. */
  ratePerTotalMile: number;
  /** Gross needed to reach it: total miles x rate per total mile. */
  rate: number;
  /** Null when no floor is set or there are no miles to price. */
  meets: boolean | null;
  /** Dollars the offer is short of the floor; 0 when it meets it. */
  shortfall: number;
}

/**
 * Gross per TOTAL mile against the owner's floor. Compared in dollars (gross
 * vs miles x floor) so a $1.7997 RPM can never round its way to "meets $1.80".
 */
export function evaluateOperationalMinimum(
  grossRate: number,
  totalMiles: number,
  ratePerTotalMile: number,
): OperationalMinimum {
  const floor = nonNegative(ratePerTotalMile);
  const miles = nonNegative(totalMiles);
  const rate = roundMoney(miles * floor);
  if (floor <= 0 || miles <= 0) {
    return { ratePerTotalMile: floor, rate, meets: null, shortfall: 0 };
  }
  const gross = nonNegative(grossRate);
  const meets = gross >= rate;
  return {
    ratePerTotalMile: floor,
    rate,
    meets,
    shortfall: meets ? 0 : roundMoney(rate - gross),
  };
}

/**
 * The real RPM as it should be PRINTED next to a floor verdict. Normal cent
 * rounding ($1.7488 -> $1.75), except when rounding would reach the floor of
 * a load that misses it: then it is truncated, so "$1.80/total mi -- below
 * your $1.80 minimum" can never appear on screen for a $1.7997 load.
 */
export function realRpmForDisplay(realRpm: number, floor: OperationalMinimum): number {
  if (floor.meets !== false) return realRpm;
  const rounded = Math.round(realRpm * 100) / 100;
  if (rounded < floor.ratePerTotalMile) return realRpm;
  return Math.floor(realRpm * 100 + 1e-9) / 100;
}

export interface LoadEstimateInput {
  grossRate: number;
  loadedMiles: number;
  /** Deadhead to pickup. */
  deadheadMiles: number;
  /** Empty miles after delivery (home or repositioning). Optional, default 0. */
  deadheadAfterMiles?: number;
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
  /** Maintenance allocation per TOTAL mile. Its own layer, never a direct cost. */
  maintenancePerMile?: number;
  /** The owner's operational floor, gross per TOTAL mile. 0/undefined = not set. */
  minRatePerTotalMile?: number;
}

export interface CostLineItem {
  key: string;
  label: string;
  amount: number;
  note?: string;
}

export interface LoadEstimate {
  /** Loaded + deadhead to pickup + deadhead after delivery. */
  totalMiles: number;
  loadedMiles: number;
  deadheadPickupMiles: number;
  deadheadAfterMiles: number;
  /** Both deadhead legs. */
  deadheadMiles: number;
  /** LOADED RPM: gross / loaded miles. The broker's number. */
  grossPerLoadedMile: number;
  /** REAL (all-in) RPM: gross / total miles. The number decisions use. */
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
  maintenancePerMile: number;
  /** maintenance $/mi x total miles. Not cash, not a direct trip cost. */
  maintenanceAllocation: number;
  contributionAfterMaintenance: number;
  contributionAfterMaintenancePerMile: number;
  contributionAfterMaintenanceMargin: number;
  /** The owner's gross-per-total-mile gate. Independent of `score.rating`. */
  operationalMinimum: OperationalMinimum;
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
  /** False when loaded miles or MPG are missing: nothing above can be trusted yet. */
  valid: boolean;
}

function feeAmount(mode: FeeMode, value: number, gross: number): number {
  const safe = nonNegative(value);
  return mode === "PCT" ? roundMoney(gross * (safe / 100)) : roundMoney(safe);
}

export function calculateLoadEstimate(
  input: LoadEstimateInput,
  thresholds: RatingThresholds,
  deadheadWarnPct: number,
): LoadEstimate {
  const loadedMiles = nonNegative(input.loadedMiles);
  const deadheadPickupMiles = nonNegative(input.deadheadMiles);
  const deadheadAfterMiles = nonNegative(input.deadheadAfterMiles);
  const deadheadMiles = deadheadPickupMiles + deadheadAfterMiles;
  const totalMiles = loadedMiles + deadheadMiles;
  const grossRate = nonNegative(input.grossRate);
  const mpg = nonNegative(input.mpg);

  const gallons = mpg > 0 ? totalMiles / mpg : 0;
  const fuelCost = roundMoney(gallons * nonNegative(input.fuelPrice));
  const tolls = roundMoney(nonNegative(input.tolls));
  const dispatch = feeAmount(input.dispatchMode, input.dispatchValue, grossRate);
  const factoring = feeAmount(input.factoringMode, input.factoringValue, grossRate);
  const otherCost = roundMoney(nonNegative(input.otherCost));
  const overhead = roundMoney(totalMiles * nonNegative(input.overheadPerMile));
  const debtService = roundMoney(totalMiles * nonNegative(input.debtServicePerMile));
  const maintenancePerMile = nonNegative(input.maintenancePerMile);
  const maintenanceAllocation = roundMoney(totalMiles * maintenancePerMile);

  const tripCost = roundMoney(fuelCost + tolls + dispatch + factoring + otherCost);
  const totalCost = roundMoney(tripCost + overhead);
  const contributionProfit = roundMoney(grossRate - tripCost);
  const contributionProfitPerMile = div(contributionProfit, totalMiles);
  const contributionMargin = div(contributionProfit, grossRate) * 100;
  const fullyLoadedOperatingProfit = roundMoney(contributionProfit - overhead);
  const fullyLoadedOperatingProfitPerMile = div(fullyLoadedOperatingProfit, totalMiles);
  const fullyLoadedOperatingMargin = div(fullyLoadedOperatingProfit, grossRate) * 100;
  const cashAfterDebtService = roundMoney(fullyLoadedOperatingProfit - debtService);
  const contributionAfterMaintenance = roundMoney(contributionProfit - maintenanceAllocation);
  const deadheadPct = div(deadheadMiles, totalMiles) * 100;

  const lines: CostLineItem[] = [
    {
      key: "fuel",
      label: "Fuel",
      amount: fuelCost,
      note:
        mpg > 0
          ? `${gallons.toFixed(1)} gal at $${nonNegative(input.fuelPrice).toFixed(2)}/gal, ${mpg.toFixed(1)} MPG`
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
  ];
  // Every direct cost is listed even at $0. A hidden $0 toll line is how an
  // empty Tolls box (showing only a grey placeholder) went unnoticed.

  return {
    totalMiles,
    loadedMiles,
    deadheadPickupMiles,
    deadheadAfterMiles,
    deadheadMiles,
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
    maintenancePerMile,
    maintenanceAllocation,
    contributionAfterMaintenance,
    contributionAfterMaintenancePerMile: div(contributionAfterMaintenance, totalMiles),
    contributionAfterMaintenanceMargin: div(contributionAfterMaintenance, grossRate) * 100,
    operationalMinimum: evaluateOperationalMinimum(
      grossRate,
      totalMiles,
      nonNegative(input.minRatePerTotalMile),
    ),
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
    valid: loadedMiles > 0 && mpg > 0,
  };
}

/* ---- What rate should I ask? ------------------------------------------ */

export interface TargetRateInput {
  loadedMiles: number;
  /** Deadhead to pickup. */
  deadheadMiles: number;
  /** Empty miles after delivery. Optional, default 0. */
  deadheadAfterMiles?: number;
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
  /** The owner's operational floor, gross per TOTAL mile. 0/undefined = not set. */
  minRatePerTotalMile?: number;
}

export interface RateTier {
  /**
   * `minimum` is the PROFITABILITY floor (the MARGINAL rating threshold).
   * `operationalMinimum` is the owner's gross-per-total-mile rule. Different
   * questions; never label one as the other.
   */
  key:
    | "operatingBreakeven"
    | "cashBreakeven"
    | "operationalMinimum"
    | "minimum"
    | "good"
    | "great"
    | "target";
  label: string;
  /** Contribution per total mile the tier is solved for (the floor for operationalMinimum). */
  profitPerMile: number;
  rate: number;
  /** Gross per TOTAL mile at this rate -- the comparable number. */
  ratePerTotalMile: number;
  /** Gross per loaded mile at this rate -- what a broker would call it. */
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
  /** Position on the CONTRIBUTION basis (the rating thresholds). */
  position: OfferPosition;
  /** The operational-minimum gate. Null when no floor is set. */
  meetsOperationalMinimum: boolean | null;
  /** Lowest number worth accepting: the higher of both floors. */
  walkAway: number;
  differenceVsGreat: number;
  /** The threshold the negotiation should aim to settle at. */
  settlementTarget: number | null;
  /** Null only when the offer meets GREAT and the operational minimum. */
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

/**
 * Compare a posted broker offer with the contribution-profit rate bands AND
 * the owner's operational minimum.
 *
 *   settle target = the next profitability tier the offer has not reached
 *                   (GOOD below Good, GREAT below Great), raised to the
 *                   operational minimum whenever the offer is under it
 *   counteroffer  = settle target + 3% (at least $25), rounded UP to $25
 *
 * Because the target is never below the operational minimum when the offer
 * misses it, the counteroffer can never recommend a number under that floor.
 */
export function compareOfferToThresholds(
  currentOffer: number,
  rates: { minimum: number; good: number; great: number; operationalMinimum?: number },
): OfferComparison {
  const offer = nonNegative(currentOffer);
  const operationalMinimum = nonNegative(rates.operationalMinimum);
  const differenceVsGreat = roundMoney(offer - rates.great);
  const meetsOperationalMinimum = operationalMinimum > 0 ? offer >= operationalMinimum : null;
  const walkAway = roundMoney(Math.max(operationalMinimum, nonNegative(rates.minimum)));

  const position: OfferPosition = offer >= rates.great
    ? "GREAT"
    : offer >= rates.good
      ? "GOOD"
      : offer >= rates.minimum
        ? "MARGINAL"
        : "BELOW_MINIMUM";
  const profitabilityTarget = position === "GREAT"
    ? null
    : position === "GOOD"
      ? rates.great
      : rates.good;
  const settlementTarget = meetsOperationalMinimum === false
    ? roundMoney(Math.max(profitabilityTarget ?? 0, operationalMinimum))
    : profitabilityTarget;

  return {
    position,
    meetsOperationalMinimum,
    walkAway,
    differenceVsGreat,
    settlementTarget,
    suggestedCounteroffer:
      settlementTarget === null ? null : suggestedOpeningQuote(settlementTarget, offer),
  };
}

/**
 * Solving for the rate.
 *
 * Dispatch and factoring are usually a cut of the rate, so they move when the
 * rate moves and cannot simply be added to the cost. With
 *
 *   f = dispatch% + factoring%   (as a fraction)
 *   C = fuel + tolls + other + overhead + any FLAT dispatch/factoring
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
  const loadedMiles = nonNegative(input.loadedMiles);
  const totalMiles =
    loadedMiles + nonNegative(input.deadheadMiles) + nonNegative(input.deadheadAfterMiles);
  const mpg = nonNegative(input.mpg);
  const gallons = mpg > 0 ? totalMiles / mpg : 0;
  const fuelCost = roundMoney(gallons * nonNegative(input.fuelPrice));
  const tolls = roundMoney(nonNegative(input.tolls));
  const otherCost = roundMoney(nonNegative(input.otherCost));
  const overhead = roundMoney(totalMiles * nonNegative(input.overheadPerMile));
  const debtService = roundMoney(totalMiles * nonNegative(input.debtServicePerMile));
  const minRatePerTotalMile = nonNegative(input.minRatePerTotalMile);

  const flatFees = roundMoney(
    (input.dispatchMode === "AMOUNT" ? nonNegative(input.dispatchValue) : 0) +
      (input.factoringMode === "AMOUNT" ? nonNegative(input.factoringValue) : 0),
  );
  const grossFeeRate =
    (input.dispatchMode === "PCT" ? nonNegative(input.dispatchValue) : 0) / 100 +
    (input.factoringMode === "PCT" ? nonNegative(input.factoringValue) : 0) / 100;

  const directFixedCost = roundMoney(fuelCost + tolls + otherCost + flatFees);
  const fixedTripCost = roundMoney(directFixedCost + overhead);
  const impossible = grossFeeRate >= 1;

  const rateFor = (costAndProfit: number): number => {
    if (impossible || totalMiles <= 0) return 0;
    return roundMoney(costAndProfit / (1 - grossFeeRate));
  };
  const target = nonNegative(input.targetProfitPerMile);

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
      label: "Profitability floor",
      ppm: thresholds.marginal,
      numerator: directFixedCost + thresholds.marginal * totalMiles,
      description: `Contributes $${thresholds.marginal.toFixed(2)}/mi after direct trip costs -- your MARGINAL rating floor.`,
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
      ppm: target,
      numerator: directFixedCost + overhead + target * totalMiles,
      description: `Clears the $${target.toFixed(2)}/mi you asked for.`,
    },
  ];

  // The operational minimum is a rule on GROSS, not on profit, so it is not
  // solved through the fee equation: it is simply total miles x the floor.
  const operationalMinimumRate =
    impossible || totalMiles <= 0 ? 0 : roundMoney(totalMiles * minRatePerTotalMile);
  const solvedTiers: RateTier[] = tierDefs.map((tier) => {
    const rate = rateFor(tier.numerator);
    return {
      key: tier.key,
      label: tier.label,
      profitPerMile: tier.ppm,
      rate,
      ratePerTotalMile: div(rate, totalMiles),
      ratePerLoadedMile: div(rate, loadedMiles),
      description: tier.description,
    } satisfies RateTier;
  });
  const operationalTier: RateTier = {
    key: "operationalMinimum",
    label: "Operational minimum",
    profitPerMile: minRatePerTotalMile,
    rate: operationalMinimumRate,
    ratePerTotalMile: div(operationalMinimumRate, totalMiles),
    ratePerLoadedMile: div(operationalMinimumRate, loadedMiles),
    description: `Your $${minRatePerTotalMile.toFixed(2)} gross per total mile, deadhead included.`,
  };
  const tiers = [
    ...solvedTiers.slice(0, 2),
    operationalTier,
    ...solvedTiers.slice(2),
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
    tiers,
    valid: loadedMiles > 0 && mpg > 0 && !impossible,
    impossible,
  };
}
