import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  exactPercentOfRate,
  feeFromPercent,
  latestFeeDefaults,
  percentOfRate,
} from "../load-fees";

describe("load fee percentages", () => {
  it("prices a percentage of the rate to the cent", () => {
    assert.equal(feeFromPercent(2450, 6), 147);
    assert.equal(feeFromPercent(2450, 3.5), 85.75);
    assert.equal(feeFromPercent(1333.33, 3.5), 46.67);
    assert.equal(feeFromPercent(0, 6), 0);
  });

  it("recognises a fee that was entered as a percentage", () => {
    assert.equal(exactPercentOfRate(147, 2450), 6);
    assert.equal(exactPercentOfRate(85.75, 2450), 3.5);
    assert.equal(exactPercentOfRate(46.67, 1333.33), 3.5);
    // Typed as dollars: no two-decimal percentage reproduces it.
    assert.equal(exactPercentOfRate(100.01, 2450), null);
    assert.equal(exactPercentOfRate(0, 2450), null);
    assert.equal(exactPercentOfRate(50, 0), null);
    assert.equal(percentOfRate(100.01, 2450), 4.08);
  });

  it("defaults to the rates on the most recent load that carried each fee", () => {
    const load = (date: string, grossRate: number, dispatchFee: number, factoringFee: number) =>
      ({ date, createdAt: `${date}T12:00:00.000Z`, grossRate, dispatchFee, factoringFee });
    const defaults = latestFeeDefaults([
      load("2026-09-01", 2000, 200, 60),
      load("2026-09-20", 2450, 147, 0),
      load("2026-09-10", 1000, 0, 35),
      load("2026-09-23", 1800, 0, 0),
    ]);
    assert.deepEqual(defaults, { dispatchPct: 6, factoringPct: 3.5 });
    assert.deepEqual(latestFeeDefaults([]), { dispatchPct: null, factoringPct: null });
  });
});
