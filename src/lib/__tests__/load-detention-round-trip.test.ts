import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { brokerPerformance, loadMetrics, loadRevenue, summarizePeriod, withMetrics } from "../calculations";
import { calculateLoadScore } from "../finance/load-score";
import { latestFeeDefaults } from "../load-fees";
import { loadLegs, loadRoute, loadStateRoute, normalizeExtraLegs } from "../load-details";
import { loadSchema } from "../schemas";
import { buildSeedDataset } from "../seed/seed-data";
import type { Load } from "../types";

// The Glendale -> Chicago -> Glendale run: one PO, one rate, 800 + 800 loaded miles, $300 detention.
function glendale(over: Partial<Load> = {}): Load {
  const base = buildSeedDataset().loads[0];
  return {
    ...base,
    id: "rt", date: "2026-10-20", deliveryDate: null, originCity: "Glendale", originState: "AZ",
    destinationCity: "Chicago", destinationState: "IL", loadedMiles: 1600, deadheadMiles: 0,
    grossRate: 3385, detentionPay: 300,
    extraLegs: [{ pickupDate: "2026-10-23", deliveryDate: "2026-10-27", originCity: "Chicago", originState: "IL", destinationCity: "Glendale", destinationState: "AZ", miles: 800 }],
    fuelCost: 0, tolls: 0, otherExpenses: 0, claimDeduction: 0, claimReason: null,
    dispatchFee: 203.1, // 6 % of the rate only
    factoringFee: 128.98, // 3.5 % of rate + detention
    costsPosted: false, ...over,
  };
}

describe("detention", () => {
  it("adds to what the load paid, its rate per mile and its profit", () => {
    const row = glendale();
    assert.equal(loadRevenue(row), 3685);
    const metrics = loadMetrics(row);
    assert.equal(metrics.revenuePerLoadedMile, 3685 / 1600);
    assert.equal(row.loadedMiles, 1600);
    assert.equal(metrics.tripProfit, 3685 - 203.1 - 128.98);
  });

  it("never changes the rating or the score: the load is rated as booked", () => {
    const thresholds = { great: 2, good: 1.5, marginal: 1 };
    // 1,600 mi, $3,385 rate, $332.08 fees: $1.91/mi as booked -> GOOD. Detention would read $2.10 -> GREAT.
    const withDetention = loadMetrics(glendale(), thresholds);
    const without = loadMetrics(glendale({ detentionPay: 0 }), thresholds);
    assert.ok(withDetention.profitPerMile > 2);
    assert.equal(withDetention.rating, "GOOD");
    assert.equal(withDetention.rating, without.rating);
    assert.deepEqual(withDetention.ratingBasis, without.ratingBasis);
    assert.equal(calculateLoadScore(withDetention, thresholds, 20).score, calculateLoadScore(without, thresholds, 20).score);
    const [broker] = brokerPerformance([withMetrics(glendale(), thresholds)], thresholds);
    assert.equal(broker.rating, "GOOD");
  });

  it("counts in the period's booked revenue, and older loads without it read as zero", () => {
    const old = glendale({ id: "old", detentionPay: undefined, extraLegs: undefined, grossRate: 1000 });
    const summary = summarizePeriod([glendale(), old], [], { start: "2026-10-01", end: "2026-10-31" });
    assert.equal(summary.bookedRevenue, 4685);
  });

  it("factoring defaults are read against rate + detention, dispatch against the rate only", () => {
    const defaults = latestFeeDefaults([glendale()]);
    assert.equal(defaults.dispatchPct, 6);
    assert.equal(defaults.factoringPct, 3.5);
  });

  it("is optional on the schema and cannot be negative", () => {
    const row = glendale();
    assert.equal(loadSchema.safeParse(row).success, true);
    assert.equal(loadSchema.safeParse({ ...row, detentionPay: undefined, extraLegs: undefined }).success, true);
    assert.equal(loadSchema.safeParse({ ...row, detentionPay: -5 }).success, false);
  });
});

describe("extra legs", () => {
  it("chains the route and splits the miles per leg", () => {
    assert.equal(loadRoute(glendale()), "Glendale, AZ → Chicago, IL → Glendale, AZ");
    assert.equal(loadStateRoute(glendale()), "AZ-IL-AZ");
    assert.deepEqual(loadLegs(glendale()).map((leg) => leg.miles), [800, 800]);
    assert.equal(loadRoute(glendale({ extraLegs: [] })), "Glendale, AZ → Chicago, IL");
    const elsewhere = glendale({ extraLegs: [{ ...glendale().extraLegs![0], originCity: "Gary", originState: "IN" }] });
    assert.equal(loadRoute(elsewhere), "Glendale, AZ → Chicago, IL → Gary, IN → Glendale, AZ");
  });

  it("validates each leg: miles, dates in order, and the first leg keeps miles of its own", () => {
    const row = glendale();
    const leg = row.extraLegs![0];
    assert.equal(loadSchema.safeParse(row).success, true);
    assert.equal(loadSchema.safeParse({ ...row, extraLegs: [{ ...leg, miles: 0 }] }).success, false);
    assert.equal(loadSchema.safeParse({ ...row, extraLegs: [{ ...leg, deliveryDate: "2026-10-01" }] }).success, false);
    assert.equal(loadSchema.safeParse({ ...row, extraLegs: [{ ...leg, miles: 1600 }] }).success, false);
    assert.equal(loadSchema.safeParse({ ...row, extraLegs: [{ ...leg, originState: "Illinois" }] }).success, false);
  });

  it("reads stored legs defensively", () => {
    assert.deepEqual(normalizeExtraLegs(null), []);
    assert.deepEqual(normalizeExtraLegs([{ originCity: "" }, "x"]), []);
    assert.equal(normalizeExtraLegs([{ ...glendale().extraLegs![0], originState: "il" }])[0].originState, "IL");
  });
});
