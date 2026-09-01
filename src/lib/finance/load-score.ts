/**
 * LOAD PROFITABILITY SCORE
 * ========================
 *
 * A 0-100 number with three visible parts. Deterministic, no weighting
 * anyone has to take on faith:
 *
 *   Contribution / mi 50 points   full marks at 1.25x the GREAT threshold
 *   Contribution %    30 points   full marks at 60% margin
 *   Deadhead          20 points   full marks at 0%, nothing at 2x the warn level
 *
 * Every component is reported with the number that produced it, so the answer
 * to "why did this load score 87?" is on the screen, not in the source.
 *
 * The CLASSIFICATION (GREAT / GOOD / MARGINAL / BAD) is NOT the score banded.
 * It stays `rateLoad()` -- Contribution Profit per total mile against the owner's own
 * thresholds -- because that is the number that decides whether a load was
 * worth running. The score adds nuance; it does not overrule the threshold.
 */

import { rateLoad, type RatingThresholds } from "../calculations";
import type { LoadMetrics, LoadWithMetrics, ProfitabilityRating } from "../types";

export const SCORE_WEIGHTS = { profitPerMile: 50, margin: 30, deadhead: 20 } as const;
export const FULL_MARGIN_PCT = 60;
/** Profit per mile that earns the full 50, as a multiple of the GREAT floor. */
export const PPM_FULL_MARKS_MULTIPLE = 1.25;

export interface ScoreComponent {
  key: "ppm" | "margin" | "deadhead";
  label: string;
  points: number;
  max: number;
  /** The measured value behind the points, already formatted by the caller. */
  value: number;
  detail: string;
}

export interface LoadScore {
  score: number;
  rating: ProfitabilityRating;
  components: ScoreComponent[];
}

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

export function calculateLoadScore(
  metrics: Pick<LoadMetrics, "profitPerMile" | "profitMargin" | "deadheadPct">,
  thresholds: RatingThresholds,
  deadheadWarnPct: number,
): LoadScore {
  const greatFloor = thresholds.great > 0 ? thresholds.great : 2;
  const ppmTarget = greatFloor * PPM_FULL_MARKS_MULTIPLE;
  const deadheadFloor = Math.max(0, deadheadWarnPct) * 2;

  const ppmPoints = clamp01(metrics.profitPerMile / ppmTarget) * SCORE_WEIGHTS.profitPerMile;
  const marginPoints = clamp01(metrics.profitMargin / FULL_MARGIN_PCT) * SCORE_WEIGHTS.margin;
  const deadheadPoints =
    (deadheadFloor > 0
      ? clamp01(1 - metrics.deadheadPct / deadheadFloor)
      : metrics.deadheadPct <= 0
        ? 1
        : 0) * SCORE_WEIGHTS.deadhead;

  const components: ScoreComponent[] = [
    {
      key: "ppm",
      label: "Contribution Profit / mile",
      points: Math.round(ppmPoints),
      max: SCORE_WEIGHTS.profitPerMile,
      value: metrics.profitPerMile,
      detail: `Full marks at $${ppmTarget.toFixed(2)}/mi`,
    },
    {
      key: "margin",
      label: "Contribution margin",
      points: Math.round(marginPoints),
      max: SCORE_WEIGHTS.margin,
      value: metrics.profitMargin,
      detail: `Full marks at ${FULL_MARGIN_PCT}%`,
    },
    {
      key: "deadhead",
      label: "Deadhead",
      points: Math.round(deadheadPoints),
      max: SCORE_WEIGHTS.deadhead,
      value: metrics.deadheadPct,
      detail:
        deadheadFloor > 0
          ? `Nothing left at ${deadheadFloor.toFixed(0)}%`
          : "Any deadhead loses these points",
    },
  ];

  return {
    // Rounded once, from the unrounded total, so the parts and the whole can
    // differ by at most a point rather than compounding.
    score: Math.max(0, Math.min(100, Math.round(ppmPoints + marginPoints + deadheadPoints))),
    rating: rateLoad(metrics.profitPerMile, thresholds),
    components,
  };
}

/** Plain-language band for the score itself, shown beside the classification. */
export function scoreBand(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Solid";
  if (score >= 40) return "Thin";
  return "Weak";
}

export type ScoredLoad = LoadWithMetrics & { score: LoadScore };

/** Attaches a score to every load, so pages never recompute it themselves. */
export function scoreLoads(
  loads: LoadWithMetrics[],
  thresholds: RatingThresholds,
  deadheadWarnPct: number,
): ScoredLoad[] {
  return loads.map((load) => ({
    ...load,
    score: calculateLoadScore(load.metrics, thresholds, deadheadWarnPct),
  }));
}

/** Best and worst by Contribution Profit per mile, the rating basis. */
export function bestAndWorst(loads: ScoredLoad[]): {
  best: ScoredLoad | undefined;
  worst: ScoredLoad | undefined;
} {
  if (loads.length === 0) return { best: undefined, worst: undefined };
  const sorted = [...loads].sort((a, b) => b.metrics.profitPerMile - a.metrics.profitPerMile);
  return {
    best: sorted[0],
    // With a single load there is no "worst" worth showing next to the best.
    worst: sorted.length > 1 ? sorted[sorted.length - 1] : undefined,
  };
}
