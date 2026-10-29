import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadMetrics, loadRevenue, summarizePeriod } from "../calculations";
import { latestFeeDefaults } from "../load-fees";
import { loadRoute, loadStateRoute } from "../load-details";
import { loadSchema } from "../schemas";
import { buildSeedDataset } from "../seed/seed-data";
import type { Load } from "../types";

// The Glendale -> Chicago -> Glendale run: one rate, 1,600 loaded miles, $300 detention.
function glendale(over: Partial<Load> = {}): Load {
  const base = buildSeedDataset().loads[0];
  return {
    ...base,
    id: "rt", date: "2026-10-20", deliveryDate: null, originCity: "Glendale", originState: "AZ",
    destinationCity: "Chicago", destinationState: "IL", loadedMiles: 1600, deadheadMiles: 0,
    grossRate: 3385, detentionPay: 300, roundTrip: true,
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
    assert.equal(metrics.tripProfit, 3685 - 203.1 - 128.98);
  });

  it("counts in the period's booked revenue, and older loads without it read as zero", () => {
    const old = glendale({ id: "old", detentionPay: undefined, roundTrip: undefined, grossRate: 1000 });
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
    assert.equal(loadSchema.safeParse({ ...row, detentionPay: undefined, roundTrip: undefined }).success, true);
    assert.equal(loadSchema.safeParse({ ...row, detentionPay: -5 }).success, false);
  });
});

describe("round trip", () => {
  it("shows the way back to the origin", () => {
    assert.equal(loadRoute(glendale()), "Glendale, AZ → Chicago, IL → Glendale, AZ");
    assert.equal(loadStateRoute(glendale()), "AZ-IL-AZ");
    assert.equal(loadRoute(glendale({ roundTrip: false })), "Glendale, AZ → Chicago, IL");
  });
});
