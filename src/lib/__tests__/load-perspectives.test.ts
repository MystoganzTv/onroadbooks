import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_RATING_THRESHOLDS, loadMetrics, tripExpenseLines } from "../calculations";
import { buildLoadProfitability } from "../finance/load-perspectives";
import { calculateLoadScore } from "../finance/load-score";
import { buildSeedDataset } from "../seed/seed-data";
import type { Expense, Load } from "../types";

const seed = buildSeedDataset();
// The $1,000 / 537 mi example. A driver is assigned and even has pay saved on
// the load: for an owner-operator neither is a cost of the load (ADR 0031).
function load(overrides: Partial<Load> = {}): Load {
  return {
    ...seed.loads[0], id: "case", grossRate: 1000, loadedMiles: 537, deadheadMiles: 0,
    fuelCost: 313.11, tolls: 0, dispatchFee: 60, factoringFee: 35, otherExpenses: 0,
    driverPay: 330, driverId: "drv", costsPosted: true, ...overrides,
  };
}
function view(trip: Load, options: { expenses?: Expense[]; allocated?: number; debt?: number } = {}) {
  return buildLoadProfitability({
    grossRevenue: trip.grossRate,
    loadedMiles: trip.loadedMiles,
    deadheadMiles: trip.deadheadMiles,
    lines: tripExpenseLines(trip, options.expenses ?? []),
    allocatedCostPerMile: options.allocated ?? 0,
    debtServicePerMile: options.debt ?? 0,
  });
}
const near = (actual: number, expected: number, places = 2) =>
  assert.equal(Math.round(actual * 10 ** places) / 10 ** places, expected);

describe("owner-operator load profitability", () => {
  it("A: gross minus direct trip costs; driver pay is not a load cost", () => {
    const result = view(load());
    assert.equal(result.directTripCosts, 408.11);
    assert.equal(result.contributionProfit, 591.89);
    near(result.contributionPerMile, 1.1);
    near(result.contributionMargin, 59.19);
    near(result.grossRpm, 1.86);
    assert.equal(tripExpenseLines(load()).some((line) => line.key === "driverPay"), false);
  });

  it("B: allocated operating costs lead to estimated net profit", () => {
    const result = view(load(), { allocated: 0.2 });
    assert.equal(result.allocatedOperatingCosts, 107.4);
    assert.equal(result.estimatedNetBusinessProfit, 484.49);
    near(result.netProfitPerMile, 0.9);
  });

  it("C: a load with no costs yields finite numbers", () => {
    const result = view(load({ fuelCost: 0, dispatchFee: 0, factoringFee: 0, driverPay: 0, driverId: null }));
    assert.equal(result.contributionProfit, 1000);
    for (const value of Object.values(result)) {
      if (typeof value === "number") assert.ok(Number.isFinite(value));
    }
  });

  it("D: deadhead is in every per-mile profit figure", () => {
    const result = view(load({ loadedMiles: 400, deadheadMiles: 100 }), { allocated: 0.1 });
    assert.equal(result.totalMiles, 500);
    near(result.contributionPerMile, 1.1838, 4);
    near(result.grossRpm, 2);
    near(result.loadedRpm, 2.5);
    assert.equal(result.allocatedOperatingCosts, 50);
  });

  it("E: zero miles never divides by zero", () => {
    const result = view(load({ loadedMiles: 0, deadheadMiles: 0 }), { allocated: 0.5, debt: 0.3 });
    assert.equal(result.contributionPerMile, 0);
    assert.equal(result.grossRpm, 0);
    assert.equal(result.allocatedOperatingCosts, 0);
  });

  it("F: a losing load reports its loss and a negative margin", () => {
    const result = view(load({ grossRate: 300 }));
    assert.equal(result.contributionProfit, -108.11);
    near(result.contributionMargin, -36.04);
  });

  it("G: ledger mirrors and driver pay rows are not counted again", () => {
    const trip = load({ id: "linked" });
    const base = { ...seed.expenses[0], loadId: trip.id, businessId: trip.businessId, truckId: trip.truckId,
      scope: "TRUCK" as const, financialTreatment: "OPERATING" as const, date: trip.date };
    const expenses: Expense[] = [
      { ...base, id: `expload_${trip.id}_dispatch`, category: "DISPATCH", amount: 60 },
      { ...base, id: `expload_${trip.id}_factoring`, category: "FACTORING", amount: 35 },
      { ...base, id: "expdriver_line-1", category: "DRIVER_PAY", amount: 330 },
      { ...base, id: "manual-driver", category: "DRIVER_PAY", amount: 50 },
      { ...base, id: "fuel-receipt", category: "FUEL", amount: 400 },
      { ...base, id: "real-toll", category: "TOLLS", amount: 12 },
    ];
    const result = view(trip, { expenses });
    // Only the independently recorded toll is added.
    assert.equal(result.directTripCosts, 420.11);
    assert.equal(result.contributionProfit, 579.89);
  });
});

describe("load quality scoring", () => {
  it("rates the $1,000 load on contribution per mile, not gross RPM", () => {
    const metrics = loadMetrics(load());
    const score = calculateLoadScore(metrics, DEFAULT_RATING_THRESHOLDS, 20);
    // $1.10/mi: above GOOD ($0.90), below GREAT ($1.25).
    assert.equal(score.rating, "GOOD");
    const ppm = score.components.find((component) => component.key === "ppm")!;
    assert.equal(ppm.detail, "Full marks at $1.56/mi");
    const margin = score.components.find((component) => component.key === "margin")!;
    assert.equal(margin.detail, "Full marks at 60%");
  });
});

describe("load calculator matches the load page", async () => {
  const { calculateLoadEstimate, calculateTargetRate } = await import("../finance/load-calculator");
  const base = {
    loadedMiles: 537, deadheadMiles: 0, fuelPrice: 3.9, mpg: 6.69, tolls: 0,
    dispatchMode: "PCT" as const, dispatchValue: 6, factoringMode: "PCT" as const, factoringValue: 3.5,
    otherCost: 0, overheadPerMile: 0,
  };
  it("prices the $1,000 load from trip costs only", () => {
    const estimate = calculateLoadEstimate({ ...base, grossRate: 1000 }, DEFAULT_RATING_THRESHOLDS, 20);
    assert.equal(estimate.contributionProfit, roundTo(1000 - estimate.fuelCost - 60 - 35));
    assert.equal(estimate.lines.some((line) => line.key === "driverPay"), false);
  });
  it("solves target rates from dispatch and factoring only", () => {
    const target = calculateTargetRate({ ...base, targetProfitPerMile: 0.5 }, DEFAULT_RATING_THRESHOLDS);
    assert.equal(Math.round(target.grossFeeRate * 1000) / 1000, 0.095);
    const great = target.tiers.find((tier) => tier.key === "great")!;
    const check = calculateLoadEstimate({ ...base, grossRate: great.rate }, DEFAULT_RATING_THRESHOLDS, 20);
    assert.ok(Math.abs(check.contributionProfitPerMile - DEFAULT_RATING_THRESHOLDS.great) < 0.001);
  });
});
function roundTo(value: number) { return Math.round(value * 100) / 100; }
