import assert from "node:assert/strict";
import { it } from "node:test";
import { behaviorTotals, categoryTotals } from "../calculations";
import { expenseBehaviorOf } from "../categories";
import { calculateTrueCostPerMile } from "../finance/cost-per-mile";
import { recurringExpenseSuggestions } from "../recurring-expenses";
import { buildSeedDataset } from "../seed/seed-data";
import type { Expense } from "../types";

it("separates a variable insurance downpayment from a fixed premium across reports and cost per mile", () => {
  const dataset = buildSeedDataset();
  const expenses: Expense[] = [
    { ...dataset.expenses[0], id: "downpayment", category: "INSURANCE", date: "2026-09-03", amount: 2305.62, behavior: "VARIABLE", financialTreatment: "OPERATING", recurring: false },
    { ...dataset.expenses[0], id: "premium", category: "INSURANCE", date: "2026-09-15", amount: 1200, behavior: "FIXED", financialTreatment: "OPERATING", recurring: false },
  ];
  assert.deepEqual(behaviorTotals(expenses, dataset.settings), { FIXED: 1200, VARIABLE: 2305.62 });
  const [category] = categoryTotals(expenses, dataset.settings);
  assert.equal(category.amount, 3505.62);
  assert.equal(category.behavior, "MIXED");
  assert.equal(category.fixedAmount, 1200);
  assert.equal(category.variableAmount, 2305.62);
  const costs = calculateTrueCostPerMile(
    [{ ...dataset.loads[0], date: "2026-09-20", loadedMiles: 1000, deadheadMiles: 0 }],
    expenses, { start: "2026-09-01", end: "2026-09-30" }, dataset.settings, "September",
  );
  assert.equal(costs.fixedTotal, 1200);
  assert.equal(costs.variableTotal, 2305.62);
  assert.equal(costs.lines.length, 1);
  assert.equal(costs.fixed[0].amount, 1200);
  assert.equal(costs.variable[0].amount, 2305.62);
  assert.equal(expenseBehaviorOf({ category: "INSURANCE", behavior: null }, { INSURANCE: "VARIABLE" }), "VARIABLE");
});

it("preserves classification on monthly repeats without making one-time fixed costs recur", () => {
  const dataset = buildSeedDataset();
  dataset.expenses = [{ ...dataset.expenses[0], category: "INSURANCE", date: "2026-08-15", description: "Monthly premium", behavior: "VARIABLE", recurring: true, notes: null }];
  assert.equal(recurringExpenseSuggestions(dataset, "2026-09")[0].behavior, "VARIABLE");
  dataset.expenses[0] = { ...dataset.expenses[0], recurring: false, behavior: "FIXED" };
  assert.deepEqual(recurringExpenseSuggestions(dataset, "2026-09"), []);
});
