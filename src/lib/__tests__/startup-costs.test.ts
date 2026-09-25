import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { operatingLedger, startupCosts } from "../startup-costs";
import { buildSeedDataset } from "../seed/seed-data";
import type { Expense, Load } from "../types";

function fixture() {
  const dataset = buildSeedDataset();
  const baseLoad = dataset.loads[0];
  const baseExpense = dataset.expenses[0];
  const load = (id: string, truckId: string, date: string): Load =>
    ({ ...baseLoad, id, truckId, date });
  const expense = (id: string, date: string, amount: number, truckId: string | null): Expense =>
    ({ ...baseExpense, id, date, amount, truckId, scope: truckId ? "TRUCK" : "BUSINESS" });
  return { load, expense };
}

describe("startup costs", () => {
  it("keeps spend before the first load out of the operating ledger", () => {
    const { load, expense } = fixture();
    const loads = [load("l2", "t1", "2026-09-24"), load("l1", "t1", "2026-09-22")];
    const expenses = [
      expense("insurance", "2026-09-03", 3051.39, "t1"),
      expense("registration", "2026-09-21", 519, "t1"),
      expense("toll", "2026-09-22", 12.5, "t1"),
      expense("phone", "2026-09-10", 60, null),
      expense("software", "2026-09-23", 30, null),
    ];
    assert.deepEqual(operatingLedger(loads, expenses).map((row) => row.id), ["toll", "software"]);
    assert.deepEqual(startupCosts(loads, expenses), {
      operatingSince: "2026-09-22", total: 3630.39, count: 3,
    });
    // Nothing is lost: every row is either operating or startup.
    assert.equal(operatingLedger(loads, expenses).length + startupCosts(loads, expenses).count, expenses.length);
  });

  it("gives a truck added later its own setup period", () => {
    const { load, expense } = fixture();
    const loads = [load("a", "t1", "2026-01-05"), load("b", "t2", "2026-06-01")];
    const expenses = [
      expense("t2-setup", "2026-05-20", 900, "t2"),
      expense("t1-repair", "2026-05-20", 400, "t1"),
      expense("t3-no-loads", "2026-05-20", 100, "t3"),
      expense("overhead", "2026-05-20", 50, null),
    ];
    assert.deepEqual(
      operatingLedger(loads, expenses).map((row) => row.id),
      ["t1-repair", "t3-no-loads", "overhead"],
    );
    assert.equal(startupCosts(loads, expenses, { start: "2026-05-01", end: "2026-05-31" }).total, 900);
    assert.equal(startupCosts(loads, expenses, { start: "2026-06-01", end: "2026-06-30" }).total, 0);
  });

  it("changes nothing before the first load exists", () => {
    const { expense } = fixture();
    const expenses = [expense("x", "2026-09-01", 10, null)];
    assert.equal(operatingLedger([], expenses), expenses);
    assert.deepEqual(startupCosts([], expenses), { operatingSince: null, total: 0, count: 0 });
  });

  it("has no setup period when the first month's bills simply post before the first load", () => {
    const { load, expense } = fixture();
    const loads = [load("l1", "t1", "2026-05-02")];
    const expenses = [expense("insurance", "2026-05-01", 685, "t1"), expense("fuel", "2026-05-03", 90, "t1")];
    assert.equal(operatingLedger(loads, expenses), expenses);
    assert.equal(startupCosts(loads, expenses).total, 0);
  });

  it("leaves the bundled demo ledger untouched", () => {
    const dataset = buildSeedDataset();
    assert.equal(operatingLedger(dataset.loads, dataset.expenses).length, dataset.expenses.length);
  });
});
