import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fuelAmounts } from "../calculations";
import { fuelSchema } from "../schemas";

describe("fuel entry amounts", () => {
  it("calculates a missing price without changing the receipt total", () => {
    const amounts = fuelAmounts(48, null, 311.07);
    assert.deepEqual(amounts, { pricePerGallon: 6.481, totalCost: 311.07 });
    assert.equal(fuelSchema.safeParse({ date: "2026-09-17", gallons: 48, ...amounts }).success, true);
  });

  it("still calculates the total from gallons and an entered pump price", () => {
    assert.deepEqual(fuelAmounts(48, 6.222, null), {
      pricePerGallon: 6.222, totalCost: 298.66,
    });
  });

  it("preserves both values when a receipt overrides the computed total", () => {
    assert.deepEqual(fuelAmounts(48, 6.481, 311.07), {
      pricePerGallon: 6.481, totalCost: 311.07,
    });
  });

  it("recalculates the missing price when gallons or total change", () => {
    assert.equal(fuelAmounts(40, null, 311.07).pricePerGallon, 7.777);
    assert.equal(fuelAmounts(48, null, 300).pricePerGallon, 6.25);
  });

  it("rejects missing or invalid inputs instead of inventing a valid price", () => {
    for (const [gallons, price, total] of [
      [0, null, 311.07], [-48, null, 311.07], [48, null, null],
      [48, null, 0], [48, 0, 311.07], [48, -1, 311.07],
    ] as const) {
      const amounts = fuelAmounts(gallons, price, total);
      assert.ok(Number.isFinite(amounts.pricePerGallon));
      assert.equal(fuelSchema.safeParse({ date: "2026-09-17", gallons, ...amounts }).success, false);
    }
  });
});
