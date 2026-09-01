/**
 * BROKER SCORECARD
 * ================
 *
 * "Which brokers are actually making me money?"
 *
 * Two axes, deliberately kept apart:
 *
 *   VOLUME   total trip profit -- who produced the most money overall.
 *   QUALITY  profit per total mile -- who pays best for the miles they cost.
 *
 * The default ordering is by total profit, because that is what a broker
 * contributed to the year. The RATING is per mile, because that is what
 * decides whether the next load from them is worth taking. A broker can
 * legitimately top the table on volume while rating worse per mile than a
 * smaller one -- that is information, not a bug in the sort.
 */

import { brokerPerformance, div, roundMoney, sum, type BrokerPerformance, type RatingThresholds } from "../calculations";
import type { LoadWithMetrics } from "../types";

export const BROKER_MIN_LOADS = 2;

export interface BrokerScore extends BrokerPerformance {
  averageMargin: number;
  averageGrossPerTotalMile: number;
  averageRevenuePerLoad: number;
  averageProfitPerLoad: number;
  paidRevenue: number;
  /** True once the broker has enough loads to rank fairly. */
  qualified: boolean;
}

export type BrokerSort = "profit" | "revenue" | "profitPerMile" | "worstProfitPerMile";

export const BROKER_SORTS: { key: BrokerSort; label: string }[] = [
  { key: "profit", label: "Most contribution profit" },
  { key: "revenue", label: "Highest Booked Revenue" },
  { key: "profitPerMile", label: "Best contribution / mile" },
  { key: "worstProfitPerMile", label: "Worst contribution / mile" },
];

export function calculateBrokerPerformance(
  loads: LoadWithMetrics[],
  thresholds: RatingThresholds,
  minLoads = BROKER_MIN_LOADS,
): BrokerScore[] {
  const base = brokerPerformance(loads, thresholds);

  return base.map((broker) => {
    const group = loads.filter((l) => (l.broker?.trim() || "No broker") === broker.broker);
    return {
      ...broker,
      averageMargin: div(broker.tripProfit, broker.revenue) * 100,
      averageGrossPerTotalMile: div(broker.revenue, broker.totalMiles),
      averageRevenuePerLoad: div(broker.revenue, broker.loadCount),
      averageProfitPerLoad: div(broker.tripProfit, broker.loadCount),
      paidRevenue: roundMoney(
        sum(
          group.filter((l) => l.status === "PAID"),
          (l) => l.grossRate,
        ),
      ),
      qualified: broker.loadCount >= minLoads,
    } satisfies BrokerScore;
  });
}

export function sortBrokers(brokers: BrokerScore[], sort: BrokerSort): BrokerScore[] {
  const copy = [...brokers];
  switch (sort) {
    case "revenue":
      return copy.sort((a, b) => b.revenue - a.revenue);
    case "profitPerMile":
      return copy.sort((a, b) => b.profitPerMile - a.profitPerMile);
    case "worstProfitPerMile":
      return copy.sort((a, b) => a.profitPerMile - b.profitPerMile);
    case "profit":
    default:
      return copy.sort((a, b) => b.tripProfit - a.tripProfit);
  }
}

/** The broker worth naming on the dashboard: best per mile with real volume. */
export function bestBroker(brokers: BrokerScore[]): BrokerScore | undefined {
  const qualified = brokers.filter((b) => b.qualified && b.broker !== "No broker");
  if (qualified.length === 0) return undefined;
  return [...qualified].sort((a, b) => b.profitPerMile - a.profitPerMile)[0];
}

export function weakestBroker(brokers: BrokerScore[]): BrokerScore | undefined {
  const qualified = brokers.filter((b) => b.qualified && b.broker !== "No broker");
  if (qualified.length < 2) return undefined;
  return [...qualified].sort((a, b) => a.profitPerMile - b.profitPerMile)[0];
}
