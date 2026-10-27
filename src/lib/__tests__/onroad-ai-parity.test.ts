import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_RATING_THRESHOLDS } from "../calculations";
import {
  calculateLoadEstimate,
  calculateTargetRate,
  compareOfferToThresholds,
  type LoadEstimateInput,
} from "../finance/load-calculator";
import { analyzeLoad, calculatorInput, negotiate } from "../onroad-ai/analyze";
import { emptyFacts, mergeFacts } from "../onroad-ai/load-facts";
import { driverProfileSchema } from "../onroad-ai/profile";

/**
 * THE SAME LOAD, THE SAME NUMBERS
 *
 * OnRoad AI must never compute a different contribution than the OnRoad
 * Books calculator page for the same load. These tests run the page's own
 * composition (calculator-panel.tsx: calculateLoadEstimate with overhead 0,
 * calculateTargetRate with targetProfitPerMile 0, then
 * compareOfferToThresholds on the four tiers) side by side with
 * `analyzeLoad`, and require deep equality -- not "close enough".
 */

/** Exactly what calculator-panel.tsx builds from its inputs. */
function webCalculator(input: LoadEstimateInput, deadheadWarnPct: number) {
  const shared = {
    loadedMiles: input.loadedMiles,
    deadheadMiles: input.deadheadMiles,
    deadheadAfterMiles: input.deadheadAfterMiles,
    fuelPrice: input.fuelPrice,
    mpg: input.mpg,
    tolls: input.tolls,
    dispatchMode: input.dispatchMode,
    dispatchValue: input.dispatchValue,
    factoringMode: input.factoringMode,
    factoringValue: input.factoringValue,
    otherCost: input.otherCost,
    overheadPerMile: 0,
    debtServicePerMile: 0,
    minRatePerTotalMile: input.minRatePerTotalMile,
  };
  const estimate = calculateLoadEstimate(
    { ...shared, grossRate: input.grossRate, maintenancePerMile: input.maintenancePerMile },
    DEFAULT_RATING_THRESHOLDS,
    deadheadWarnPct,
  );
  const target = calculateTargetRate({ ...shared, targetProfitPerMile: 0 }, DEFAULT_RATING_THRESHOLDS);
  const tier = (key: string) => target.tiers.find((item) => item.key === key)!;
  const operational = tier("operationalMinimum");
  const comparison = compareOfferToThresholds(input.grossRate, {
    minimum: tier("minimum").rate,
    good: tier("good").rate,
    great: tier("great").rate,
    operationalMinimum: operational.rate > 0 ? operational.rate : 0,
  });
  return { estimate, target, comparison };
}

const FIXTURES: { name: string; profile: Record<string, unknown>; load: Record<string, unknown> }[] = [
  {
    // load-calculator-floor.test.ts validation case (Arrington -> Rio Rancho)
    name: "validation case $3,300 / 1,747 + 140",
    profile: { truckType: "BOX_TRUCK", mpg: 8.5, fuelPrice: 6.82, dispatchValue: 5, factoringValue: 3.2, maintenancePerMile: 0.2, minRatePerTotalMile: 1.8 },
    load: { grossRate: 3_300, loadedMiles: 1_747, deadheadPickupMiles: 140, tolls: 38 },
  },
  {
    name: "spec example $2,800 / 1,400 + 120",
    profile: { truckType: "BOX_TRUCK", mpg: 8.5, fuelPrice: 6.7, dispatchValue: 5, factoringValue: 3.5, maintenancePerMile: 0.2, minRatePerTotalMile: 1.8 },
    load: { grossRate: 2_800, loadedMiles: 1_400, deadheadPickupMiles: 120 },
  },
  {
    name: "flat dispatch fee, return deadhead, other costs, no floor",
    profile: { truckType: "BOX_TRUCK", mpg: 9.2, fuelPrice: 4.15, dispatchMode: "AMOUNT", dispatchValue: 150, factoringValue: 0, maintenancePerMile: 0.18, minRatePerTotalMile: 0 },
    load: { grossRate: 1_250, loadedMiles: 480, deadheadPickupMiles: 25, deadheadAfterMiles: 300, tolls: 22.5, otherCosts: 75 },
  },
  {
    name: "EPS terms: 6% dispatch, 3.5% factoring",
    profile: { truckType: "BOX_TRUCK", mpg: 8.5, fuelPrice: 3.89, dispatchValue: 6, factoringValue: 3.5, maintenancePerMile: 0.2, minRatePerTotalMile: 1.8 },
    load: { grossRate: 575, loadedMiles: 212, deadheadPickupMiles: 40 },
  },
];

describe("OnRoad AI produces the OnRoad Books calculator's numbers exactly", () => {
  for (const fixture of FIXTURES) {
    it(fixture.name, () => {
      const profile = driverProfileSchema.parse(fixture.profile);
      const facts = mergeFacts(emptyFacts(), fixture.load);
      const analysis = analyzeLoad(profile, facts);
      assert.equal(analysis.status, "OK");
      if (analysis.status !== "OK") return;

      const web = webCalculator(calculatorInput(profile, facts), profile.deadheadWarnPct);
      assert.deepEqual(analysis.estimate, web.estimate, "estimate differs from the web calculator");
      assert.deepEqual(analysis.target, web.target, "rate tiers differ from the web calculator");
      assert.deepEqual(analysis.negotiation.comparison, web.comparison, "offer comparison differs from the web calculator");
    });
  }

  it("locks the validation case to the cent (same values as load-calculator-floor.test.ts)", () => {
    const profile = driverProfileSchema.parse(FIXTURES[0].profile);
    const analysis = analyzeLoad(profile, mergeFacts(emptyFacts(), FIXTURES[0].load));
    assert.equal(analysis.status, "OK");
    if (analysis.status !== "OK") return;
    const e = analysis.estimate;
    assert.equal(e.totalMiles, 1_887);
    assert.equal(e.fuelCost, 1_514.04);
    assert.equal(e.dispatch, 165);
    assert.equal(e.factoring, 105.6);
    assert.equal(e.directTripCosts, 1_822.64);
    assert.equal(e.contributionProfit, 1_477.36);
    assert.equal(e.maintenanceAllocation, 377.4);
    assert.equal(e.contributionAfterMaintenance, 1_099.96);
    assert.equal(e.operationalMinimum.rate, 3_396.6);
    assert.equal(e.operationalMinimum.meets, false);
    assert.equal(analysis.negotiation.walkAway.rate, 3_396.6);
  });

  it("never charges monthly overhead or debt service to a single load", () => {
    const profile = driverProfileSchema.parse(FIXTURES[1].profile);
    const input = calculatorInput(profile, mergeFacts(emptyFacts(), FIXTURES[1].load));
    assert.equal(input.overheadPerMile, 0);
    assert.equal(input.debtServicePerMile, 0);
  });

  it("negotiate() with no offer is the web comparison at $0", () => {
    const profile = driverProfileSchema.parse(FIXTURES[1].profile);
    const { grossRate: _g, maintenancePerMile: _m, ...shared } = calculatorInput(profile, mergeFacts(emptyFacts(), FIXTURES[1].load));
    const target = calculateTargetRate({ ...shared, targetProfitPerMile: 0 }, DEFAULT_RATING_THRESHOLDS);
    const n = negotiate(target, 0, 1_400);
    const tier = (key: string) => target.tiers.find((item) => item.key === key)!;
    assert.deepEqual(
      n.comparison,
      compareOfferToThresholds(0, { minimum: tier("minimum").rate, good: tier("good").rate, great: tier("great").rate, operationalMinimum: tier("operationalMinimum").rate }),
    );
    assert.equal(n.target.rate, Math.max(tier("good").rate, tier("operationalMinimum").rate));
  });
});
