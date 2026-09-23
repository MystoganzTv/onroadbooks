import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadMetrics, summarizeFuel } from "../calculations";
import { loadExpenseId, reconcileLoadExpenseLedger } from "../load-expenses";
import { fuelSchema } from "../schemas";
import { buildSeedDataset } from "../seed/seed-data";

describe("truck fuel purchases", () => {
  it("adopts legacy links without losing purchases, receipts or trip estimates", () => {
    const dataset = buildSeedDataset();
    const load = dataset.loads[0];
    load.costsPosted = true;
    load.fuelCost = 180;
    const receipt = dataset.fuelEntries[0];
    receipt.loadId = load.id;
    const expense = dataset.expenses.find((row) => row.id === receipt.expenseId)!;
    assert.ok(expense);
    expense.loadId = load.id;
    expense.receiptNumber = "RECEIPT-123";
    const originalAmount = expense.amount;
    dataset.expenses.push({ ...expense, id: loadExpenseId(load.id, "fuel"), amount: 180 });
    const before = loadMetrics(load);

    reconcileLoadExpenseLedger(dataset);
    assert.equal(receipt.loadId, null);
    assert.equal(expense.loadId, null);
    assert.equal(expense.amount, originalAmount);
    assert.equal(expense.receiptNumber, "RECEIPT-123");
    assert.equal(receipt.expenseId, expense.id);
    assert.equal(dataset.expenses.filter((row) => row.id === expense.id).length, 1);
    assert.equal(dataset.expenses.some((row) => row.id === loadExpenseId(load.id, "fuel")), false);
    assert.deepEqual(loadMetrics(load), before);
    assert.equal(load.fuelCost, 180);
    const once = JSON.stringify(dataset);
    reconcileLoadExpenseLedger(dataset);
    assert.equal(JSON.stringify(dataset), once);
  });

  it("does not infer 1.1 MPG from the reported 46 miles and 41.107 gallons", () => {
    const template = buildSeedDataset().fuelEntries[0];
    const summary = summarizeFuel([
      { ...template, id: "first", date: "2026-09-21", odometer: 269954, gallons: 48, totalCost: 300 },
      { ...template, id: "next", date: "2026-09-22", odometer: 270000, gallons: 41.107, totalCost: 277.43 },
    ], 290);
    assert.equal(summary.milesPerGallon, null);
    assert.equal(summary.odometerMiles, null);
    assert.equal(summary.totalGallons, 89.107);
    assert.equal(summary.totalCost, 577.43);
  });

  it("accepts old client payloads without linking a receipt to a load", () => {
    const receipt = buildSeedDataset().fuelEntries[0];
    assert.equal(fuelSchema.parse({ ...receipt, loadId: "legacy-load" }).loadId, null);
  });
});
