/**
 * LANE INTELLIGENCE
 * =================
 *
 * Direction matters. VA -> NJ and NJ -> VA are two different businesses: one
 * may be a strong outbound lane and the other the empty-ish backhaul that
 * pays for the privilege of getting home. They are never averaged together.
 *
 * The caller can group by curated freight market or by state. Market is more
 * commercially useful; state remains available for smaller samples.
 *
 * A lane is not ranked until it has run at least LANE_MIN_LOADS times. Two
 * loads is an anecdote, and a ranking built on anecdotes is worse than no
 * ranking at all.
 */

import { div, roundMoney, sum, type RatingThresholds } from "../calculations";
import { rateLoad } from "../calculations";
import type { LoadWithMetrics, ProfitabilityRating } from "../types";
import { freightMarket } from "../markets";

export const LANE_MIN_LOADS = 3;

export interface LanePerformance {
  key: string;
  originState: string;
  destinationState: string;
  originKey: string;
  destinationKey: string;
  originLabel: string;
  destinationLabel: string;
  label: string;
  loadCount: number;
  revenue: number;
  totalMiles: number;
  loadedMiles: number;
  deadheadMiles: number;
  deadheadPct: number;
  profit: number;
  profitPerMile: number;
  revenuePerLoadedMile: number;
  revenuePerTotalMile: number;
  averageMargin: number;
  rating: ProfitabilityRating;
  /** True once the lane has enough loads to be ranked. */
  qualified: boolean;
}

export type LaneGrouping = "state" | "market";

export function calculateLanePerformance(
  loads: LoadWithMetrics[],
  thresholds: RatingThresholds,
  minLoads = LANE_MIN_LOADS,
  grouping: LaneGrouping = "state",
): LanePerformance[] {
  const buckets = new Map<string, LoadWithMetrics[]>();

  for (const load of loads) {
    const originState = (load.originState || "??").toUpperCase();
    const destinationState = (load.destinationState || "??").toUpperCase();
    const origin = grouping === "market"
      ? freightMarket(load.originCity, originState)
      : { key: originState, label: originState };
    const destination = grouping === "market"
      ? freightMarket(load.destinationCity, destinationState)
      : { key: destinationState, label: destinationState };
    const key = `${origin.key}>${destination.key}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(load);
    else buckets.set(key, [load]);
  }

  return [...buckets.entries()]
    .map(([key, group]) => {
      const first = group[0];
      const originState = first.originState.toUpperCase();
      const destinationState = first.destinationState.toUpperCase();
      const origin = grouping === "market"
        ? freightMarket(first.originCity, originState)
        : { key: originState, label: originState };
      const destination = grouping === "market"
        ? freightMarket(first.destinationCity, destinationState)
        : { key: destinationState, label: destinationState };
      const revenue = roundMoney(sum(group, (l) => l.grossRate));
      const totalMiles = sum(group, (l) => l.metrics.totalMiles);
      const loadedMiles = sum(group, (l) => l.loadedMiles);
      const deadheadMiles = sum(group, (l) => l.deadheadMiles);
      const profit = roundMoney(sum(group, (l) => l.metrics.tripProfit));
      const profitPerMile = div(profit, totalMiles);

      return {
        key,
        originState,
        destinationState,
        originKey: origin.key,
        destinationKey: destination.key,
        originLabel: origin.label,
        destinationLabel: destination.label,
        label: `${origin.label} → ${destination.label}`,
        loadCount: group.length,
        revenue,
        totalMiles,
        loadedMiles,
        deadheadMiles,
        deadheadPct: div(deadheadMiles, totalMiles) * 100,
        profit,
        profitPerMile,
        revenuePerLoadedMile: div(revenue, loadedMiles),
        revenuePerTotalMile: div(revenue, totalMiles),
        averageMargin: div(profit, revenue) * 100,
        rating: rateLoad(profitPerMile, thresholds),
        qualified: group.length >= minLoads,
      } satisfies LanePerformance;
    })
    .sort((a, b) => b.profitPerMile - a.profitPerMile || b.loadCount - a.loadCount);
}

export interface LaneRanking {
  best: LanePerformance[];
  worst: LanePerformance[];
  /** Lanes seen but not yet ranked, with how many more loads they need. */
  emerging: LanePerformance[];
  qualifiedCount: number;
  minLoads: number;
}

export function rankLanes(lanes: LanePerformance[], take = 4, minLoads = LANE_MIN_LOADS): LaneRanking {
  const qualified = lanes.filter((l) => l.qualified);
  return {
    best: qualified.slice(0, take),
    worst: qualified.slice(-take).reverse().filter((lane) => !qualified.slice(0, take).includes(lane)),
    emerging: lanes.filter((l) => !l.qualified).sort((a, b) => b.loadCount - a.loadCount),
    qualifiedCount: qualified.length,
    minLoads,
  };
}
