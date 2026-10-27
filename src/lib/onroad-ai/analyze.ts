/**
 * FREIGHT ANALYSIS -- the WhatsApp side of the OnRoad Books load calculator
 * ========================================================================
 *
 * This module does NO arithmetic of its own on money. It maps a driver
 * profile and a set of load facts onto the exact inputs the web calculator
 * page builds (`components/calculator/calculator-panel.tsx`) and calls the
 * same functions:
 *
 *   calculateLoadEstimate     totals, RPMs, direct costs, contribution,
 *                             maintenance layer, operational minimum, score
 *   calculateTargetRate       the rate tiers (profitability floor, GOOD,
 *                             GREAT, operational minimum)
 *   compareOfferToThresholds  position, walk-away, settle target, counter
 *   realRpmForDisplay         the RPM printed next to the floor verdict
 *
 * Like the page, it passes overheadPerMile = 0 and debtServicePerMile = 0:
 * monthly business costs (insurance, ELD, DAT, truck note) are never charged
 * to a single load. So the same load gives the same numbers, to the cent,
 * on the web, in the iOS app and here. `onroad-ai-parity.test.ts` holds that.
 *
 * What IS decided here is the TAKE / NEGOTIATE / PASS verdict, and it is
 * deterministic: the rating, the operational minimum, deadhead, equipment
 * and the schedule, in that order, each with its reason.
 */

import { div } from "../calculations";
import {
  calculateLoadEstimate,
  calculateTargetRate,
  compareOfferToThresholds,
  realRpmForDisplay,
  type LoadEstimate,
  type LoadEstimateInput,
  type OfferComparison,
  type TargetRate,
} from "../finance/load-calculator";
import { scoreBand } from "../finance/load-score";
import { checkCompatibility, isBlocking, type Compatibility, type CompatibilityIssue } from "./equipment";
import { missingCriticalFields, type CriticalField, type LoadFacts } from "./load-facts";
import { missingProfileFields, thresholdsOf, type DriverProfile, type RequiredProfileField } from "./profile";

export type Decision = "TAKE" | "NEGOTIATE" | "PASS";
export type ScoreBand = "Excellent" | "Solid" | "Thin" | "Weak";

export interface PricePoint {
  rate: number;
  perTotalMile: number;
  perLoadedMile: number;
}

export interface Negotiation {
  /** Opening number to quote. Equals the offer when no counter is needed. */
  ask: PricePoint;
  /** Where the negotiation should settle. */
  target: PricePoint;
  /** Lowest worth accepting: the higher of the profitability floor and the operational minimum. */
  walkAway: PricePoint;
  /** False when the offer already meets GREAT and the operational minimum. */
  counterNeeded: boolean;
  comparison: OfferComparison;
}

export type Caution =
  | { kind: "DEADHEAD_HIGH"; pct: number; warnPct: number }
  | { kind: "DEADHEAD_OVER_MAX"; miles: number; maxMiles: number }
  | { kind: "AFTER_MAINTENANCE_NEGATIVE"; amount: number };

export type ConfirmItem =
  | { kind: "COMPATIBILITY"; issue: CompatibilityIssue }
  | { kind: "SCHEDULE_TIGHT"; milesPerDay: number; maxMilesPerDay: number; days: number }
  | { kind: "DATES_UNKNOWN" }
  | { kind: "TOLLS_ASSUMED"; amount: number }
  | { kind: "EXTRA_STOPS"; stops: number }
  | { kind: "PARTIAL_LOAD" }
  | { kind: "ROUND_TRIP_RETURN_UNKNOWN" };

export type DecisionReason =
  | { kind: "INCOMPATIBLE"; issue: CompatibilityIssue }
  | { kind: "BELOW_PROFITABILITY_FLOOR"; walkAway: number }
  | { kind: "BELOW_OPERATIONAL_MINIMUM"; shortfall: number; floor: number }
  | { kind: "MARGINAL"; target: number }
  | { kind: "CAUTION"; caution: Caution; ask: number }
  | { kind: "MEETS_ALL"; rating: "GREAT" | "GOOD"; ask: number | null };

export type FreightAnalysis =
  | {
      status: "NEEDS_PROFILE";
      missingProfile: RequiredProfileField[];
    }
  | {
      status: "NEEDS_INFO";
      missing: CriticalField[];
    }
  | {
      status: "OK";
      facts: LoadFacts;
      /** True when there is an offer to judge; false for "what should I ask?". */
      hasOffer: boolean;
      estimate: LoadEstimate;
      target: TargetRate;
      negotiation: Negotiation;
      scoreBand: ScoreBand;
      /** Real RPM as printed beside the floor verdict (never rounds up to the floor). */
      displayRealRpm: number;
      compatibility: Compatibility;
      cautions: Caution[];
      confirm: ConfirmItem[];
      decision: Decision | null;
      reason: DecisionReason | null;
    };

/** The exact calculator input the web page would build for this load. */
export function calculatorInput(profile: DriverProfile, facts: LoadFacts): LoadEstimateInput {
  return {
    grossRate: facts.grossRate ?? 0,
    loadedMiles: facts.loadedMiles ?? 0,
    deadheadMiles: facts.deadheadPickupMiles ?? 0,
    deadheadAfterMiles: facts.deadheadAfterMiles ?? 0,
    fuelPrice: profile.fuelPrice ?? 0,
    mpg: profile.mpg ?? 0,
    tolls: facts.tolls ?? profile.defaultTolls,
    dispatchMode: profile.dispatchMode,
    dispatchValue: profile.dispatchValue ?? 0,
    factoringMode: profile.factoringMode,
    factoringValue: profile.factoringValue ?? 0,
    otherCost: facts.otherCosts ?? profile.defaultOtherCost,
    overheadPerMile: 0,
    debtServicePerMile: 0,
    maintenancePerMile: profile.maintenancePerMile,
    minRatePerTotalMile: profile.minRatePerTotalMile ?? 0,
  };
}

function pricePoint(rate: number, totalMiles: number, loadedMiles: number): PricePoint {
  return { rate, perTotalMile: div(rate, totalMiles), perLoadedMile: div(rate, loadedMiles) };
}

/**
 * The calculator page's "offer vs thresholds" composition, verbatim:
 * the four tiers out of `calculateTargetRate`, then `compareOfferToThresholds`.
 * With no offer it is compared at $0, which yields the opening ask for the lane.
 */
export function negotiate(target: TargetRate, offer: number, loadedMiles: number): Negotiation {
  const tier = (key: "operationalMinimum" | "minimum" | "good" | "great") =>
    target.tiers.find((item) => item.key === key)!;
  const operational = tier("operationalMinimum");
  const hasFloor = operational.rate > 0;
  const comparison = compareOfferToThresholds(offer, {
    minimum: tier("minimum").rate,
    good: tier("good").rate,
    great: tier("great").rate,
    operationalMinimum: hasFloor ? operational.rate : 0,
  });
  const askRate = comparison.suggestedCounteroffer ?? offer;
  const targetRate = comparison.settlementTarget ?? offer;
  return {
    ask: pricePoint(askRate, target.totalMiles, loadedMiles),
    target: pricePoint(targetRate, target.totalMiles, loadedMiles),
    walkAway: pricePoint(comparison.walkAway, target.totalMiles, loadedMiles),
    counterNeeded: comparison.suggestedCounteroffer !== null,
    comparison,
  };
}

function daysBetween(from: string, to: string): number | null {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 86_400_000);
}

export function analyzeLoad(profile: DriverProfile, facts: LoadFacts, options: { needOffer?: boolean } = {}): FreightAnalysis {
  const missingProfile = missingProfileFields(profile);
  if (missingProfile.length) return { status: "NEEDS_PROFILE", missingProfile };

  const needOffer = options.needOffer ?? true;
  const missing = missingCriticalFields(facts, needOffer);
  if (missing.length) return { status: "NEEDS_INFO", missing };

  const thresholds = thresholdsOf(profile);
  const input = calculatorInput(profile, facts);
  const estimate = calculateLoadEstimate(input, thresholds, profile.deadheadWarnPct);
  const { grossRate: _gross, maintenancePerMile: _maintenance, ...shared } = input;
  const target = calculateTargetRate({ ...shared, targetProfitPerMile: 0 }, thresholds);
  const hasOffer = (facts.grossRate ?? 0) > 0;
  const negotiation = negotiate(target, hasOffer ? input.grossRate : 0, estimate.loadedMiles);
  const compatibility = checkCompatibility(facts, profile);

  const cautions: Caution[] = [];
  if (estimate.deadheadPct > profile.deadheadWarnPct) {
    cautions.push({ kind: "DEADHEAD_HIGH", pct: estimate.deadheadPct, warnPct: profile.deadheadWarnPct });
  }
  if (profile.maxDeadheadMiles !== null && estimate.deadheadPickupMiles > profile.maxDeadheadMiles) {
    cautions.push({ kind: "DEADHEAD_OVER_MAX", miles: estimate.deadheadPickupMiles, maxMiles: profile.maxDeadheadMiles });
  }
  if (hasOffer && estimate.contributionAfterMaintenance < 0) {
    cautions.push({ kind: "AFTER_MAINTENANCE_NEGATIVE", amount: estimate.contributionAfterMaintenance });
  }

  const confirm: ConfirmItem[] = compatibility.issues
    .filter((issue) => !isBlocking(issue))
    .map((issue) => ({ kind: "COMPATIBILITY" as const, issue }));
  if (facts.pickupDate && facts.deliveryDate) {
    const days = daysBetween(facts.pickupDate, facts.deliveryDate);
    if (days !== null) {
      const drivingDays = Math.max(1, days);
      const milesPerDay = estimate.loadedMiles / drivingDays;
      if (milesPerDay > profile.maxMilesPerDay) {
        confirm.push({ kind: "SCHEDULE_TIGHT", milesPerDay, maxMilesPerDay: profile.maxMilesPerDay, days });
      }
    }
  } else {
    confirm.push({ kind: "DATES_UNKNOWN" });
  }
  if (facts.tolls === null) confirm.push({ kind: "TOLLS_ASSUMED", amount: input.tolls });
  if (facts.extraStops !== null && facts.extraStops > 0) confirm.push({ kind: "EXTRA_STOPS", stops: facts.extraStops });
  if (facts.loadKind === "PARTIAL") confirm.push({ kind: "PARTIAL_LOAD" });
  if (facts.loadKind === "ROUND_TRIP" && facts.deadheadAfterMiles === null) {
    confirm.push({ kind: "ROUND_TRIP_RETURN_UNKNOWN" });
  }

  let decision: Decision | null = null;
  let reason: DecisionReason | null = null;
  if (hasOffer) {
    const rating = estimate.score.rating;
    const blocking = compatibility.issues.find(isBlocking);
    const comparison = negotiation.comparison;
    if (blocking) {
      decision = "PASS";
      reason = { kind: "INCOMPATIBLE", issue: blocking };
    } else if (rating === "BAD") {
      decision = "PASS";
      reason = { kind: "BELOW_PROFITABILITY_FLOOR", walkAway: comparison.walkAway };
    } else if (estimate.operationalMinimum.meets === false) {
      decision = "NEGOTIATE";
      reason = {
        kind: "BELOW_OPERATIONAL_MINIMUM",
        shortfall: estimate.operationalMinimum.shortfall,
        floor: estimate.operationalMinimum.ratePerTotalMile,
      };
    } else if (rating === "MARGINAL") {
      decision = "NEGOTIATE";
      reason = { kind: "MARGINAL", target: negotiation.target.rate };
    } else if (cautions.length) {
      decision = "NEGOTIATE";
      reason = { kind: "CAUTION", caution: cautions[0], ask: negotiation.ask.rate };
    } else {
      decision = "TAKE";
      reason = {
        kind: "MEETS_ALL",
        rating: rating === "GREAT" ? "GREAT" : "GOOD",
        ask: negotiation.counterNeeded ? negotiation.ask.rate : null,
      };
    }
  }

  return {
    status: "OK",
    facts,
    hasOffer,
    estimate,
    target,
    negotiation,
    scoreBand: scoreBand(estimate.score.score) as ScoreBand,
    displayRealRpm: realRpmForDisplay(estimate.grossPerTotalMile, estimate.operationalMinimum),
    compatibility,
    cautions,
    confirm,
    decision,
    reason,
  };
}
