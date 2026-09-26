import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMetrics, tripExpenseLines } from "../calculations";
import { buildLoadProfitability } from "../finance/load-perspectives";
import { calculateLoadScore } from "../finance/load-score";
import { DEFAULT_RATING_THRESHOLDS } from "../calculations";
import { buildSeedDataset } from "../seed/seed-data";
import type { Expense, Load } from "../types";

const seed = buildSeedDataset();
function load(overrides: Partial<Load> = {}): Load {
  return {
    ...seed.loads[0], id: "case", grossRate: 1000, loadedMiles: 537, deadheadMiles: 0,
    fuelCost: 313.11, tolls: 0, dispatchFee: 60, factoringFee: 35, otherExpenses: 0,
    driverPay: 330, driverId: "drv", costsPosted: true, ...overrides,
  };
}
function view(trip: Load, options: { owner?: boolean; expenses?: Expense[]; allocated?: number; debt?: number } = {}) {
  return buildLoadProfitability({
    grossRevenue: trip.grossRate,
    loadedMiles: trip.loadedMiles,
    deadheadMiles: trip.deadheadMiles,
    lines: tripExpenseLines(trip, options.expenses ?? []),
    allocatedCostPerMile: options.allocated ?? 0,
    debtServicePerMile: options.debt ?? 0,
    driverIsOwner: options.owner ?? false,
  });
}
const near = (actual: number, expected: number, places = 2) =>
  assert.equal(Math.round(actual * 10 ** places) / 10 ** places, expected);

describe("load profitability perspectives", () => {
  it("A: a hired driver is a business cost", () => {
    const result = view(load());
    assert.equal(result.business.directTripCosts, 408.11);
    assert.equal(result.business.driverCompensation, 330);
    assert.equal(result.business.contributionProfit, 261.89);
    near(result.business.contributionPerMile, 0.49);
    near(result.business.contributionMargin, 26.19);
    near(result.business.grossRpm, 1.86);
    assert.equal(result.ownerOperator, null);
    // The same number the rest of the app reports for the load.
    assert.equal(loadMetrics(load()).tripProfit, result.business.contributionProfit);
    near(result.driver.payPerTotalMile, 0.61);
    assert.equal(result.driver.payPerHour, null);
  });

  it("B: when the owner drives, the benefit is split, never called profit", () => {
    const result = view(load(), { owner: true, allocated: 0.2 });
    assert.equal(result.business.contributionProfit, 261.89);
    assert.deepEqual(result.ownerOperator, {
      driverCompensation: 330,
      businessContribution: 261.89,
      ownerEconomicBenefit: 591.89,
      estimatedNetBusinessProfit: 154.49,
    });
    // The business view is identical whoever drove.
    assert.deepEqual(result.business, view(load(), { allocated: 0.2 }).business);
  });

  it("C: no driver pay yields no NaN and says labour is missing", () => {
    const result = view(load({ driverPay: 0, driverId: null }), { owner: true });
    assert.equal(result.noDriverPay, true);
    assert.equal(result.driver.payPerTotalMile, 0);
    assert.equal(result.ownerOperator?.ownerEconomicBenefit, 591.89);
    for (const value of Object.values(result.business)) {
      if (typeof value === "number") assert.ok(Number.isFinite(value));
    }
  });

  it("D: deadhead is in every per-mile profit figure", () => {
    const result = view(load({ loadedMiles: 400, deadheadMiles: 100 }), { allocated: 0.1 });
    assert.equal(result.business.totalMiles, 500);
    near(result.business.contributionPerMile, 0.5238, 4);
    near(result.business.grossRpm, 2);
    near(result.business.loadedRpm, 2.5);
    assert.equal(result.business.allocatedOperatingCosts, 50);
    near(result.driver.payPerTotalMile, 0.66);
    near(result.driver.payPerLoadedMile, 0.825, 3);
  });

  it("E: zero miles never divides by zero", () => {
    const result = view(load({ loadedMiles: 0, deadheadMiles: 0 }), { allocated: 0.5, debt: 0.3 });
    assert.equal(result.business.contributionPerMile, 0);
    assert.equal(result.business.grossRpm, 0);
    assert.equal(result.business.allocatedOperatingCosts, 0);
    assert.equal(result.driver.payPerLoadedMile, 0);
  });

  it("F: a losing load reports its loss and a negative margin", () => {
    const result = view(load({ grossRate: 600 }), { owner: true });
    assert.equal(result.business.contributionProfit, -138.11);
    near(result.business.contributionMargin, -23.02);
    assert.equal(result.ownerOperator?.ownerEconomicBenefit, 191.89);
  });

  it("G: ledger mirrors of the load's own costs are not counted again", () => {
    const trip = load({ id: "linked" });
    const base = { ...seed.expenses[0], loadId: trip.id, businessId: trip.businessId, truckId: trip.truckId,
      scope: "TRUCK" as const, financialTreatment: "OPERATING" as const, date: trip.date };
    const expenses: Expense[] = [
      { ...base, id: `expload_${trip.id}_dispatch`, category: "DISPATCH", amount: 60 },
      { ...base, id: `expload_${trip.id}_factoring`, category: "FACTORING", amount: 35 },
      { ...base, id: "expdriver_line-1", category: "DRIVER_PAY", amount: 330 },
      { ...base, id: "fuel-receipt", category: "FUEL", amount: 400 },
      { ...base, id: "real-toll", category: "TOLLS", amount: 12 },
    ];
    const result = view(trip, { expenses });
    // Only the independently recorded toll is added.
    assert.equal(result.business.directTripCosts, 420.11);
    assert.equal(result.business.driverCompensation, 330);
    assert.equal(result.business.contributionProfit, 249.89);
  });
});

describe("load quality scoring", () => {
  it("rates the $1,000 hired-driver load on contribution per mile, not gross RPM", () => {
    const metrics = loadMetrics(load());
    const score = calculateLoadScore(metrics, DEFAULT_RATING_THRESHOLDS, 20);
    assert.equal(score.rating, "MARGINAL");
    const ppm = score.components.find((component) => component.key === "ppm")!;
    assert.equal(ppm.detail, "Full marks at $1.25/mi");
    const margin = score.components.find((component) => component.key === "margin")!;
    assert.equal(margin.detail, "Full marks at 40%");
  });
});

describe("load calculator pays the driver", async () => {
  const { calculateLoadEstimate, calculateTargetRate } = await import("../finance/load-calculator");
  const base = {
    loadedMiles: 537, deadheadMiles: 0, fuelPrice: 3.9, mpg: 6.69, tolls: 0,
    dispatchMode: "PCT" as const, dispatchValue: 6, factoringMode: "PCT" as const, factoringValue: 3.5,
    otherCost: 0, overheadPerMile: 0,
  };
  it("prices the same $1,000 load the same way as the load page", () => {
    const estimate = calculateLoadEstimate(
      { ...base, grossRate: 1000, driverPayMode: "PCT", driverPayValue: 33 },
      DEFAULT_RATING_THRESHOLDS,
      20,
    );
    assert.equal(estimate.driverPay, 330);
    assert.equal(estimate.contributionProfit, roundTo(1000 - estimate.fuelCost - 60 - 35 - 330));
    assert.equal(estimate.score.rating, "MARGINAL");
    // Without driver pay the calculator would call it GREAT: the old mismatch.
    const unpaid = calculateLoadEstimate({ ...base, grossRate: 1000 }, DEFAULT_RATING_THRESHOLDS, 20);
    assert.equal(unpaid.driverPay, 0);
    assert.equal(unpaid.score.rating, "GREAT");
  });
  it("solves target rates with the driver's share of gross", () => {
    const target = calculateTargetRate(
      { ...base, driverPayMode: "PCT", driverPayValue: 33, targetProfitPerMile: 0.5 },
      DEFAULT_RATING_THRESHOLDS,
    );
    assert.equal(Math.round(target.grossFeeRate * 1000) / 1000, 0.425);
    const great = target.tiers.find((tier) => tier.key === "great")!;
    const check = calculateLoadEstimate(
      { ...base, grossRate: great.rate, driverPayMode: "PCT", driverPayValue: 33 },
      DEFAULT_RATING_THRESHOLDS,
      20,
    );
    assert.ok(Math.abs(check.contributionProfitPerMile - DEFAULT_RATING_THRESHOLDS.great) < 0.001);
  });
});
function roundTo(value: number) { return Math.round(value * 100) / 100; }
