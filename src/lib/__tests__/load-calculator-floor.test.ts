import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_RATING_THRESHOLDS } from "../calculations";
import {
  DEFAULT_MAINTENANCE_PER_MILE,
  DEFAULT_MIN_RATE_PER_TOTAL_MILE,
  calculateLoadEstimate,
  calculateTargetRate,
  compareOfferToThresholds,
  evaluateOperationalMinimum,
  realRpmForDisplay,
  type LoadEstimateInput,
} from "../finance/load-calculator";

/**
 * The owner's own evaluation rules (2026-10-13): loaded RPM vs real RPM,
 * a $1.80 gross-per-TOTAL-mile operational minimum, a $0.20/total-mile
 * maintenance allocation kept apart from direct trip costs, and a
 * counteroffer that can never land under the operational minimum.
 */

const thresholds = DEFAULT_RATING_THRESHOLDS; // 1.25 / 0.90 / 0.60

/** The Arrington -> Rio Rancho test case. Only a fixture: nothing is hardcoded. */
const validation: LoadEstimateInput = {
  grossRate: 3_300,
  loadedMiles: 1_747,
  deadheadMiles: 140,
  deadheadAfterMiles: 0,
  fuelPrice: 6.82,
  mpg: 8.5,
  tolls: 38,
  dispatchMode: "PCT",
  dispatchValue: 5,
  factoringMode: "PCT",
  factoringValue: 3.2,
  otherCost: 0,
  overheadPerMile: 0,
  debtServicePerMile: 0,
  maintenancePerMile: 0.2,
  minRatePerTotalMile: 1.8,
};

const estimate = (overrides: Partial<LoadEstimateInput> = {}) =>
  calculateLoadEstimate({ ...validation, ...overrides }, thresholds, 20);

const targetFor = (overrides: Partial<LoadEstimateInput> = {}) => {
  const { grossRate: _gross, maintenancePerMile: _maintenance, ...rest } = { ...validation, ...overrides };
  return calculateTargetRate({ ...rest, targetProfitPerMile: 0 }, thresholds);
};

const near = (actual: number, expected: number, tolerance = 0.005) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not ~${expected}`);

describe("load calculator: validation case ($3,300, 1,747 + 140 mi)", () => {
  const e = estimate();

  it("matches every expected number", () => {
    assert.equal(e.totalMiles, 1_887);
    near(e.grossPerLoadedMile, 1.89);
    near(e.grossPerTotalMile, 1.75);
    near(e.gallons, 222, 1e-9);
    assert.equal(e.fuelCost, 1_514.04);
    assert.equal(e.dispatch, 165);
    assert.equal(e.factoring, 105.6);
    assert.equal(e.tolls, 38);
    assert.equal(e.directTripCosts, 1_822.64);
    assert.equal(e.contributionProfit, 1_477.36);
    near(e.contributionMargin, 44.8, 0.05);
    near(e.contributionProfitPerMile, 0.78);
    assert.equal(e.maintenanceAllocation, 377.4);
    assert.equal(e.contributionAfterMaintenance, 1_099.96);
    near(e.contributionAfterMaintenancePerMile, 0.58);
  });

  it("is below the $1.80 operational minimum of $3,396.60", () => {
    assert.equal(e.operationalMinimum.rate, 3_396.6);
    assert.equal(e.operationalMinimum.meets, false);
    assert.equal(e.operationalMinimum.shortfall, 96.6);
  });

  it("is still profitable on the contribution basis -- both facts survive", () => {
    assert.equal(e.score.rating, "MARGINAL");
    assert.ok(e.contributionProfit > 0);
    assert.equal(e.operationalMinimum.meets, false);
  });

  it("shows thresholds per TOTAL mile, with the operational minimum separate from the profitability floor", () => {
    const t = targetFor();
    const tier = (key: string) => t.tiers.find((row) => row.key === key)!;
    assert.equal(tier("operationalMinimum").rate, 3_396.6);
    near(tier("operationalMinimum").ratePerTotalMile, 1.8, 1e-9);
    // Profitability floor = MARGINAL contribution of $0.60/total mi.
    assert.equal(tier("minimum").rate, 2_924.01);
    assert.equal(tier("good").rate, 3_540.68);
    assert.equal(tier("great").rate, 4_260.12);
    near(tier("good").ratePerTotalMile, 3_540.68 / 1_887, 1e-9);
    near(tier("great").ratePerLoadedMile, 4_260.12 / 1_747, 1e-9);
    assert.notEqual(tier("minimum").label, tier("operationalMinimum").label);
  });

  it("counters at $3,650 and never below $3,396.60", () => {
    const t = targetFor();
    const rate = (key: string) => t.tiers.find((row) => row.key === key)!.rate;
    const c = compareOfferToThresholds(3_300, {
      minimum: rate("minimum"),
      good: rate("good"),
      great: rate("great"),
      operationalMinimum: rate("operationalMinimum"),
    });
    assert.equal(c.position, "MARGINAL");
    assert.equal(c.meetsOperationalMinimum, false);
    assert.equal(c.settlementTarget, 3_540.68); // Good is above the floor here
    assert.equal(c.suggestedCounteroffer, 3_650); // +3% = 3,646.90 -> next $25
    assert.equal(c.walkAway, 3_396.6);
  });
});

describe("load calculator: direct costs, tolls and other", () => {
  it("deducts tolls and other costs from contribution (the $38 toll bug)", () => {
    const withTolls = estimate();
    const noTolls = estimate({ tolls: 0 });
    assert.equal(noTolls.contributionProfit, 1_515.36);
    assert.equal(withTolls.contributionProfit, 1_477.36);
    const withOther = estimate({ otherCost: 75 });
    assert.equal(withOther.directTripCosts, 1_897.64);
    assert.equal(withOther.contributionProfit, 1_402.36);
  });

  it("lists every direct cost line, even at $0, so an empty box is visible", () => {
    const keys = estimate({ tolls: 0, otherCost: 0, dispatchValue: 0, factoringValue: 0 })
      .lines.map((line) => line.key);
    assert.deepEqual(keys, ["fuel", "tolls", "dispatch", "factoring", "other"]);
  });

  it("direct trip costs are exactly the sum of the lines", () => {
    const e = estimate({ otherCost: 41.5 });
    near(e.lines.reduce((sum, line) => sum + line.amount, 0), e.directTripCosts, 0.001);
    near(e.grossPerTotalMile * e.totalMiles - e.directTripCosts, e.contributionProfit, 0.01);
  });

  it("handles zero dispatch and zero factoring", () => {
    const e = estimate({ dispatchValue: 0, factoringValue: 0 });
    assert.equal(e.dispatch, 0);
    assert.equal(e.factoring, 0);
    assert.equal(e.contributionProfit, roundCents(3_300 - 1_514.04 - 38));
  });
});

describe("load calculator: maintenance is its own layer", () => {
  it("never enters direct trip costs, the rating or the score", () => {
    const none = estimate({ maintenancePerMile: 0 });
    const heavy = estimate({ maintenancePerMile: 0.9 });
    assert.equal(none.directTripCosts, heavy.directTripCosts);
    assert.equal(none.contributionProfit, heavy.contributionProfit);
    assert.equal(none.score.rating, heavy.score.rating);
    assert.equal(none.score.score, heavy.score.score);
    assert.equal(none.maintenanceAllocation, 0);
    assert.equal(none.contributionAfterMaintenance, none.contributionProfit);
    assert.equal(heavy.maintenanceAllocation, 1_698.3);
  });

  it("is charged on TOTAL miles, deadhead included", () => {
    assert.equal(estimate({ deadheadMiles: 0 }).maintenanceAllocation, 349.4);
    assert.equal(estimate().maintenanceAllocation, 377.4);
  });
});

describe("load calculator: deadhead and RPM", () => {
  it("with no deadhead, loaded RPM equals real RPM", () => {
    const e = estimate({ deadheadMiles: 0, deadheadAfterMiles: 0 });
    assert.equal(e.totalMiles, 1_747);
    assert.equal(e.grossPerLoadedMile, e.grossPerTotalMile);
    assert.equal(e.deadheadPct, 0);
  });

  it("deadhead after delivery counts in total miles, fuel, real RPM, maintenance and the floor", () => {
    const base = estimate();
    const after = estimate({ deadheadAfterMiles: 113 });
    assert.equal(after.totalMiles, 2_000);
    assert.equal(after.deadheadMiles, 253);
    assert.equal(after.grossPerLoadedMile, base.grossPerLoadedMile);
    assert.ok(after.grossPerTotalMile < base.grossPerTotalMile);
    assert.ok(after.fuelCost > base.fuelCost);
    assert.equal(after.maintenanceAllocation, 400);
    assert.equal(after.operationalMinimum.rate, 3_600);
    const target = targetFor({ deadheadAfterMiles: 113 });
    assert.equal(target.totalMiles, 2_000);
  });

  it("high deadhead drags real RPM under the floor even when loaded RPM clears it", () => {
    const e = estimate({ grossRate: 2_000, loadedMiles: 1_000, deadheadMiles: 400 });
    assert.ok(e.grossPerLoadedMile >= 1.8);
    assert.ok(e.grossPerTotalMile < 1.8);
    assert.equal(e.operationalMinimum.meets, false);
    assert.ok(e.score.components.find((c) => c.key === "deadhead")!.points < 20);
  });
});

describe("load calculator: operational minimum gate", () => {
  it("is inclusive at exactly the floor", () => {
    assert.equal(evaluateOperationalMinimum(3_396.6, 1_887, 1.8).meets, true);
    assert.equal(evaluateOperationalMinimum(3_396.59, 1_887, 1.8).meets, false);
  });

  it("is off when no floor is set or there are no miles", () => {
    assert.equal(evaluateOperationalMinimum(3_300, 1_887, 0).meets, null);
    assert.equal(evaluateOperationalMinimum(3_300, 0, 1.8).meets, null);
    assert.equal(estimate({ minRatePerTotalMile: 0 }).operationalMinimum.meets, null);
  });

  it("never prints a rounded-up $1.80 next to 'below $1.80'", () => {
    const e = estimate({ grossRate: 3_396 }); // 1.79968... /total mi
    assert.equal(e.operationalMinimum.meets, false);
    assert.equal(realRpmForDisplay(e.grossPerTotalMile, e.operationalMinimum), 1.79);
    // Ordinary cent rounding otherwise: $3,300 / 1,887 = 1.7488 still reads $1.75.
    const offer = estimate();
    assert.equal(realRpmForDisplay(offer.grossPerTotalMile, offer.operationalMinimum), offer.grossPerTotalMile);
    assert.equal(Math.round(offer.grossPerTotalMile * 100) / 100, 1.75);
  });

  it("very low and very high rates", () => {
    const low = estimate({ grossRate: 500 });
    assert.ok(low.contributionProfit < 0);
    assert.equal(low.score.rating, "BAD");
    assert.equal(low.operationalMinimum.meets, false);
    const high = estimate({ grossRate: 9_000 });
    assert.equal(high.score.rating, "GREAT");
    assert.equal(high.operationalMinimum.meets, true);
    assert.equal(high.operationalMinimum.shortfall, 0);
  });

  it("ships the owner's defaults", () => {
    assert.equal(DEFAULT_MIN_RATE_PER_TOTAL_MILE, 1.8);
    assert.equal(DEFAULT_MAINTENANCE_PER_MILE, 0.2);
  });
});

describe("load calculator: counteroffer respects the operational minimum", () => {
  it("raises the target to the floor when Good sits below it", () => {
    const c = compareOfferToThresholds(2_000, {
      minimum: 1_800,
      good: 2_100,
      great: 2_600,
      operationalMinimum: 2_500,
    });
    assert.equal(c.position, "MARGINAL");
    assert.equal(c.settlementTarget, 2_500);
    assert.equal(c.suggestedCounteroffer, 2_575); // 2,500 + 3% = 2,575
    assert.equal(c.walkAway, 2_500);
  });

  it("still counters a GREAT-on-contribution offer that misses the floor", () => {
    const c = compareOfferToThresholds(2_700, {
      minimum: 1_800,
      good: 2_100,
      great: 2_600,
      operationalMinimum: 3_000,
    });
    assert.equal(c.position, "GREAT");
    assert.equal(c.meetsOperationalMinimum, false);
    assert.equal(c.settlementTarget, 3_000);
    assert.ok(c.suggestedCounteroffer! >= 3_000);
  });

  it("recommends nothing once both GREAT and the floor are met", () => {
    const c = compareOfferToThresholds(5_000, {
      minimum: 1_800,
      good: 2_100,
      great: 2_600,
      operationalMinimum: 3_000,
    });
    assert.equal(c.suggestedCounteroffer, null);
    assert.equal(c.meetsOperationalMinimum, true);
  });

  it("is never below the floor nor the current offer, across a sweep of offers", () => {
    const t = targetFor();
    const rate = (key: string) => t.tiers.find((row) => row.key === key)!.rate;
    const rates = {
      minimum: rate("minimum"),
      good: rate("good"),
      great: rate("great"),
      operationalMinimum: rate("operationalMinimum"),
    };
    for (let offer = 0; offer <= 5_000; offer += 37.5) {
      const c = compareOfferToThresholds(offer, rates);
      if (c.suggestedCounteroffer === null) {
        assert.ok(offer >= rates.great && offer >= rates.operationalMinimum);
        continue;
      }
      assert.ok(c.suggestedCounteroffer >= rates.operationalMinimum, `offer ${offer}`);
      assert.ok(c.suggestedCounteroffer >= offer, `offer ${offer}`);
      assert.equal(c.suggestedCounteroffer % 25, 0);
    }
  });

  it("keeps the old behaviour when no floor is given", () => {
    const c = compareOfferToThresholds(650, { minimum: 589.81, good: 753.22, great: 916.62 });
    assert.equal(c.meetsOperationalMinimum, null);
    assert.equal(c.suggestedCounteroffer, 800);
    assert.equal(c.walkAway, 589.81);
  });
});

describe("load calculator: invalid inputs", () => {
  it("zero loaded miles is not a load, even with deadhead", () => {
    const e = estimate({ loadedMiles: 0 });
    assert.equal(e.valid, false);
    assert.equal(e.grossPerLoadedMile, 0);
    assert.equal(targetFor({ loadedMiles: 0 }).valid, false);
  });

  it("missing MPG is invalid", () => {
    assert.equal(estimate({ mpg: 0 }).valid, false);
  });

  it("NaN, Infinity and negatives never reach the money", () => {
    const e = estimate({
      tolls: Number.NaN,
      otherCost: -50,
      deadheadAfterMiles: Number.POSITIVE_INFINITY,
      maintenancePerMile: -1,
      minRatePerTotalMile: Number.NaN,
    });
    assert.equal(e.tolls, 0);
    assert.equal(e.otherCost, 0);
    assert.equal(e.deadheadAfterMiles, 0);
    assert.equal(e.maintenanceAllocation, 0);
    assert.equal(e.operationalMinimum.meets, null);
    assert.ok(Number.isFinite(e.contributionProfit));
  });
});

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}
