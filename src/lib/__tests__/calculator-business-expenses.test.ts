import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculatorBusinessExpenses } from "../finance/calculator-business-expenses";
import { buildSeedDataset } from "../seed/seed-data";
import type { Expense } from "../types";

const template = buildSeedDataset().expenses[0];
const expense = (id: string, overrides: Partial<Expense> = {}): Expense => ({
  ...template, id, category: "INSURANCE", description: id, amount: 1200,
  date: "2026-09-01", scope: "TRUCK", truckId: "truck-a", loadId: null,
  financialTreatment: "OPERATING", ...overrides,
});

describe("calculator monthly business expenses", () => {
  it("uses recorded month-specific amounts and includes shared costs without allocating them", () => {
    const result = calculatorBusinessExpenses([
      expense("insurance"),
      expense("parking", { category: "PARKING", amount: 200 }),
      expense("eld", { category: "ELD", amount: 25 }),
      expense("DAT", { category: "SOFTWARE", amount: 59, scope: "BUSINESS", truckId: null }),
      expense("previous", { date: "2026-08-31" }),
      expense("next", { date: "2026-10-01" }),
      expense("another truck", { truckId: "truck-b" }),
    ], "truck-a", "2026-09-26");
    assert.equal(result.month, "2026-09");
    assert.equal(result.total, 1484);
    assert.deepEqual(result.entries.map((row) => row.id).sort(), ["DAT", "eld", "insurance", "parking"]);
    assert.equal(result.entries.find((row) => row.id === "DAT")?.amount, 59);
  });

  it("excludes trip costs and financing but includes recorded repairs and credits", () => {
    const result = calculatorBusinessExpenses([
      ...(["FUEL", "TOLLS", "DISPATCH", "FACTORING", "DRIVER_PAY"] as const)
        .map((category) => expense(category, { category })),
      expense("trip permit", { category: "PERMITS", loadId: "load-1" }),
      expense("financing", { category: "TRUCK_PAYMENT", financialTreatment: "DEBT_UNALLOCATED" }),
      expense("custom principal", { category: "OTHER", financialTreatment: "PRINCIPAL" }),
      expense("repair", { category: "REPAIRS", amount: 100.10 }),
      expense("credit", { category: "REPAIRS", amount: -20.05 }),
    ], "truck-a", "2026-09-26");
    assert.equal(result.total, 80.05);
    assert.deepEqual(result.entries.map((row) => row.id), ["credit", "repair"]);
  });

  it("does not carry last month's amounts into an empty new month", () => {
    const result = calculatorBusinessExpenses([expense("insurance")], "truck-a", "2026-10-01");
    assert.equal(result.total, 0);
    assert.deepEqual(result.entries, []);
  });
});
