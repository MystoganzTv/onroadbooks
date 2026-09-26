import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMetrics, tripExpenseLines, withMetricsAll } from "../calculations";
import { reconcileLoadExpenseLedger } from "../load-expenses";
import { buildSeedDataset } from "../seed/seed-data";
import type { Expense } from "../types";

function fixture() {
  const dataset = buildSeedDataset();
  const load = { ...dataset.loads[0], id: "trip_with_underscores", grossRate: 1000,
    loadedMiles: 100, deadheadMiles: 0, fuelCost: 100, tolls: 20,
    dispatchFee: 0, factoringFee: 0, otherExpenses: 0, driverPay: 50, costsPosted: true };
  const expense: Expense = { ...dataset.expenses[0], id: "manual-toll", loadId: load.id,
    businessId: load.businessId, truckId: load.truckId, scope: "TRUCK",
    category: "TOLLS", amount: 30, financialTreatment: "OPERATING", date: "2027-01-01" };
  return { dataset, load, expense };
}

describe("expenses recorded against a load", () => {
  it("includes linked costs even when posted later, without changing the load or ledger", () => {
    const { load, expense } = fixture();
    const before = JSON.stringify({ load, expense });
    const metrics = loadMetrics(load, undefined, [expense]);
    // Fuel 100 + tolls 20 + the linked toll 30. Driver pay (50) is not a load cost.
    assert.equal(metrics.tripExpenses, 150);
    assert.equal(metrics.tripProfit, 850);
    assert.equal(metrics.profitPerMile, 8.5);
    assert.equal(tripExpenseLines(load, [expense]).find((line) => line.key === "tolls")?.amount, 50);
    assert.deepEqual(withMetricsAll([load], undefined, [expense])[0].metrics, metrics);
    assert.equal(JSON.stringify({ load, expense }), before);
    assert.equal(loadMetrics(load, undefined, []).tripProfit, 880);
    assert.equal(loadMetrics(load, undefined, [{ ...expense, amount: 40 }]).tripProfit, 840);
  });

  it("counts generated load costs once and ignores driver pay, fuel, debt and unrelated rows", () => {
    const { dataset, load, expense } = fixture();
    dataset.loads = [load];
    dataset.expenses = [expense];
    dataset.fuelEntries = [];
    reconcileLoadExpenseLedger(dataset);
    dataset.expenses.push(
      { ...expense, id: "expdriver_settlement-line", category: "DRIVER_PAY", amount: 50 },
      { ...expense, id: "fuel", category: "FUEL", amount: 300 },
      { ...expense, id: "loan", financialTreatment: "PRINCIPAL", amount: 500 },
      { ...expense, id: "other-load", loadId: "another", amount: 100 },
      { ...expense, id: "other-business", businessId: "another", amount: 100 },
      { ...expense, id: "overhead", loadId: null, amount: 100 },
    );
    assert.equal(loadMetrics(load, undefined, dataset.expenses).tripExpenses, 150);
  });

  it("groups independent dispatch, factoring and other costs in the same waterfall", () => {
    const { load, expense } = fixture();
    const expenses: Expense[] = [
      { ...expense, id: "dispatch", category: "DISPATCH", amount: 40 },
      { ...expense, id: "factoring", category: "FACTORING", amount: 25 },
      { ...expense, id: "parking", category: "PARKING", amount: 10 },
    ];
    const lines = tripExpenseLines(load, expenses);
    assert.equal(lines.find((line) => line.key === "dispatch")?.amount, 40);
    assert.equal(lines.find((line) => line.key === "factoring")?.amount, 25);
    assert.equal(lines.find((line) => line.key === "other")?.amount, 10);
    assert.equal(loadMetrics(load, undefined, expenses).tripExpenses, 195);
  });
});
