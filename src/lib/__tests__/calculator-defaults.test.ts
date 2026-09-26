import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculatorDefaults } from "../finance/calculator-defaults";
import { buildSeedDataset } from "../seed/seed-data";

describe("shared web and mobile calculator defaults", () => {
  it("requires the truck's reference MPG instead of inferring efficiency from purchased fuel", () => {
    const dataset = buildSeedDataset();
    const truck = { ...dataset.trucks[0], referenceMpg: null };
    assert.ok(dataset.fuelEntries.length > 0);
    assert.equal(calculatorDefaults(dataset, truck, "2026-09-26").mpg, null);
    assert.equal(calculatorDefaults(dataset, { ...truck, referenceMpg: 8.5 }, "2026-09-26").mpg, 8.5);
  });

  it("keeps fuel, fees and monthly context scoped to the selected truck", () => {
    const dataset = buildSeedDataset();
    const truck = dataset.trucks[0];
    dataset.loads = [
      { ...dataset.loads[0], truckId: truck.id, grossRate: 1000, dispatchFee: 60, factoringFee: 35 },
      { ...dataset.loads[0], id: "other", truckId: "other", grossRate: 9000, dispatchFee: 0, factoringFee: 0 },
    ];
    dataset.fuelEntries = [
      { ...dataset.fuelEntries[0], truckId: truck.id, date: "2026-09-25", pricePerGallon: 4.25 },
      { ...dataset.fuelEntries[0], id: "other", truckId: "other", date: "2026-09-26", pricePerGallon: 9 },
    ];
    const expense = { ...dataset.expenses[0], date: "2026-09-01", category: "INSURANCE" as const, financialTreatment: "OPERATING" as const, loadId: null };
    dataset.expenses = [
      { ...expense, id: "truck", truckId: truck.id, scope: "TRUCK", amount: 1200 },
      { ...expense, id: "shared", truckId: null, scope: "BUSINESS", amount: 50 },
      { ...expense, id: "other", truckId: "other", scope: "TRUCK", amount: 999 },
    ];
    const defaults = calculatorDefaults(dataset, truck, "2026-09-26");
    assert.equal(defaults.fuelPrice, 4.25);
    assert.equal(defaults.dispatchPct, 6);
    assert.equal(defaults.factoringPct, 3.5);
    assert.equal(defaults.businessExpenses.total, 1250);
    assert.deepEqual(defaults.businessExpenses.entries.map(row => row.id).sort(), ["shared", "truck"]);
    dataset.expenses[0].amount = 2400;
    const changed = calculatorDefaults(dataset, truck, "2026-09-26");
    assert.equal(changed.businessExpenses.total, 2450);
    const { businessExpenses: _before, ...tripBefore } = defaults;
    const { businessExpenses: _after, ...tripAfter } = changed;
    assert.deepEqual(tripAfter, tripBefore);
  });
});
