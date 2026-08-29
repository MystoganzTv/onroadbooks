import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { summarizePeriod, thresholdsFromSettings, withMetricsAll } from "../calculations";
import {
  activeTrucks,
  directExpenses,
  expensesForTruck,
  isFleet,
  loadsForTruck,
  overheadExpenses,
  orderedTrucks,
  primaryTruck,
  truckById,
} from "../fleet";
import { calculateTrueCostPerMile } from "../finance/cost-per-mile";
import { calculateFleetSummary, fleetExtremes } from "../finance/fleet";
import { calculateSafeOwnerPay, resolveReserveRules } from "../finance/owner-pay";
import { resolvePeriod } from "../periods";
import { buildSeedDataset } from "../seed/seed-data";
import type { Expense, Load, Truck } from "../types";

function load(over: Partial<Load> = {}): Load {
  return {
    id: "l1",
    businessId: "b",
    truckId: "t1",
    date: "2026-08-05",
    originCity: "A",
    originState: "VA",
    destinationCity: "B",
    destinationState: "MD",
    broker: "Acme",
    loadNumber: null,
    loadedMiles: 100,
    deadheadMiles: 0,
    grossRate: 500,
    fuelCost: 0,
    tolls: 0,
    dispatchFee: 0,
    factoringFee: 0,
    otherExpenses: 0,
    status: "PAID",
    notes: null,
    createdAt: "",
    ...over,
  };
}

/**
 * THE MIGRATION INVARIANT
 * =======================
 *
 * The whole point of the fleet work is that it changes what the app CAN say,
 * not what it already said. These are the figures the app reported for August
 * 2026 before trucks became a collection and expenses gained a scope; if any
 * one of them moves, the migration is wrong -- not the arithmetic.
 */
describe("August 2026 after the fleet migration", () => {
  const dataset = buildSeedDataset();
  const august = resolvePeriod("2026-08", "full");
  const summary = summarizePeriod(dataset.loads, dataset.expenses, august, dataset.settings);

  it("reports exactly the revenue, expenses and profit it always did", () => {
    assert.equal(summary.grossRevenue, 9795);
    assert.equal(summary.operatingExpenses, 6143.9);
    assert.equal(summary.netProfit, 3651.1);
  });

  it("still costs the same to run a mile", () => {
    const cost = calculateTrueCostPerMile(
      dataset.loads,
      dataset.expenses,
      august,
      dataset.settings,
      "August",
    );
    assert.equal(Math.round(cost.trueCostPerMile * 100) / 100, 1.84);
    assert.equal(summary.totalMiles, 3332);
  });

  it("leaves the same amount safe to pay yourself", () => {
    const pay = calculateSafeOwnerPay(
      summary,
      resolveReserveRules(dataset.settings, dataset.reserveAccounts),
    );
    assert.equal(pay.safeToPay, 2235.23);
  });

  it("still splits a month into halves that sum back to it", () => {
    const a = summarizePeriod(
      dataset.loads,
      dataset.expenses,
      resolvePeriod("2026-08", "first"),
      dataset.settings,
    );
    const b = summarizePeriod(
      dataset.loads,
      dataset.expenses,
      resolvePeriod("2026-08", "second"),
      dataset.settings,
    );
    assert.equal(a.grossRevenue + b.grossRevenue, summary.grossRevenue);
    assert.equal(
      Math.round((a.operatingExpenses + b.operatingExpenses) * 100) / 100,
      summary.operatingExpenses,
    );
  });
});

describe("the seeded business is still a single-truck business", () => {
  const dataset = buildSeedDataset();

  it("has exactly one truck, and it is the primary one", () => {
    assert.equal(dataset.trucks.length, 1);
    assert.equal(activeTrucks(dataset.trucks).length, 1);
    assert.equal(primaryTruck(dataset.trucks).id, dataset.trucks[0].id);
    assert.equal(isFleet(dataset), false);
  });

  it("charges every expense to that truck, so nothing became overhead by accident", () => {
    assert.equal(overheadExpenses(dataset.expenses).length, 0);
    assert.equal(directExpenses(dataset.expenses).length, dataset.expenses.length);
    for (const expense of dataset.expenses) {
      assert.equal(expense.scope, "TRUCK", expense.id);
      assert.equal(expense.truckId, dataset.trucks[0].id, expense.id);
    }
  });

  it("scoping to the only truck changes nothing at all", () => {
    const id = dataset.trucks[0].id;
    assert.equal(loadsForTruck(dataset.loads, id).length, dataset.loads.length);
    assert.equal(expensesForTruck(dataset.expenses, id).length, dataset.expenses.length);
  });
});

/* ---- The accessors that everything else is built on -------------------- */

function truck(over: Partial<Truck> = {}): Truck {
  return {
    id: "t1",
    businessId: "b",
    name: "Unit 101",
    acquiredOn: null,
    soldOn: null,
    year: null,
    make: null,
    model: null,
    vin: null,
    purchasePrice: null,
    monthlyPayment: null,
    monthlyInsurance: null,
    startingOdometer: 0,
    currentOdometer: 0,
    active: true,
    createdAt: "",
    ...over,
  };
}

function expense(over: Partial<Expense> = {}): Expense {
  return {
    id: "e1",
    businessId: "b",
    truckId: "t1",
    scope: "TRUCK",
    loadId: null,
    date: "2026-08-05",
    category: "OTHER",
    description: "x",
    vendor: null,
    amount: 100,
    recurring: false,
    receiptNumber: null,
    notes: null,
    createdAt: "",
    ...over,
  };
}

describe("reading a fleet", () => {
  const fleet = [
    truck({ id: "t1", name: "Unit 101" }),
    truck({ id: "t2", name: "Unit 102" }),
    truck({ id: "t3", name: "Old Girl", active: false, soldOn: "2026-03-01" }),
  ];

  it("prefers an active truck as the primary one", () => {
    assert.equal(primaryTruck([fleet[2], fleet[1]]).id, "t2");
  });

  it("falls back to an inactive truck rather than returning nothing", () => {
    // Deactivating the only truck must not take the whole app down.
    assert.equal(primaryTruck([fleet[2]]).id, "t3");
  });

  it("orders active units first, then by name", () => {
    const ordered = orderedTrucks([fleet[2], fleet[1], fleet[0]]);
    assert.deepEqual(ordered.map((t) => t.id), ["t1", "t2", "t3"]);
  });

  it("counts a retired truck out of the active fleet but keeps it findable", () => {
    assert.equal(activeTrucks(fleet).length, 2);
    assert.equal(truckById(fleet, "t3")?.name, "Old Girl");
  });

  it("treats two active trucks as a fleet and one as not", () => {
    assert.equal(isFleet({ trucks: fleet }), true);
    assert.equal(isFleet({ trucks: [fleet[0]] }), false);
  });
});

describe("scoping expenses to a unit", () => {
  const expenses = [
    expense({ id: "a", truckId: "t1", amount: 500 }),
    expense({ id: "b", truckId: "t2", amount: 300 }),
    expense({ id: "c", truckId: null, scope: "BUSINESS", amount: 200 }),
  ];

  it("charges a unit only what it caused", () => {
    const mine = expensesForTruck(expenses, "t1");
    assert.deepEqual(mine.map((e) => e.id), ["a"]);
  });

  it("never charges business overhead to a truck", () => {
    // This is the whole reason the scope column exists: imputing the phone
    // bill to a unit invents a cost per truck.
    for (const id of ["t1", "t2"]) {
      assert.equal(expensesForTruck(expenses, id).some((e) => e.scope === "BUSINESS"), false);
    }
  });

  it("keeps overhead visible at the fleet level", () => {
    assert.equal(overheadExpenses(expenses).length, 1);
    assert.equal(directExpenses(expenses).length, 2);
    // Direct plus overhead is everything: nothing falls between the two.
    assert.equal(
      directExpenses(expenses).length + overheadExpenses(expenses).length,
      expenses.length,
    );
  });

  it("returns everything when nothing is scoped", () => {
    assert.equal(expensesForTruck(expenses, null).length, 3);
  });
});

describe("per-load metrics are unaffected by scope", () => {
  it("still rates loads the same way", () => {
    const dataset = buildSeedDataset();
    const thresholds = thresholdsFromSettings(dataset.settings);
    const rated = withMetricsAll(dataset.loads, thresholds);
    const august = rated.filter((l) => l.date.startsWith("2026-08"));
    const counts = august.reduce<Record<string, number>>((acc, l) => {
      acc[l.metrics.rating] = (acc[l.metrics.rating] ?? 0) + 1;
      return acc;
    }, {});
    assert.deepEqual(counts, { GREAT: 11, GOOD: 3, MARGINAL: 2, BAD: 2 });
  });
});

/* ---- Fleet economics ---------------------------------------------------- */

describe("calculateFleetSummary", () => {
  const august = resolvePeriod("2026-08", "full");
  const settings = buildSeedDataset().settings;

  const fleet = [truck({ id: "t1", name: "Unit 101" }), truck({ id: "t2", name: "Unit 102" })];

  const loads = [
    load({ id: "l1", truckId: "t1", grossRate: 9000, loadedMiles: 2700, deadheadMiles: 300 }),
    load({ id: "l2", truckId: "t2", grossRate: 6000, loadedMiles: 1800, deadheadMiles: 200 }),
  ];

  const expenses = [
    expense({ id: "e1", truckId: "t1", amount: 4000 }),
    expense({ id: "e2", truckId: "t2", amount: 3500 }),
    // Overhead: belongs to the business, to no unit.
    expense({ id: "o1", truckId: null, scope: "BUSINESS", amount: 1500, category: "PHONE" }),
  ];

  const fleetSummary = calculateFleetSummary(fleet, loads, expenses, august, settings);

  it("gives each unit its own contribution", () => {
    const unit101 = fleetSummary.units.find((u) => u.truck.id === "t1")!;
    assert.equal(unit101.revenue, 9000);
    assert.equal(unit101.directCosts, 4000);
    assert.equal(unit101.contribution, 5000);
    assert.equal(unit101.totalMiles, 3000);
  });

  it("never charges overhead to a unit", () => {
    const total = fleetSummary.units.reduce((n, u) => n + u.directCosts, 0);
    assert.equal(total, 7500);
    assert.equal(fleetSummary.overhead, 1500);
  });

  it("subtracts overhead once, at the bottom", () => {
    assert.equal(fleetSummary.contribution, 7500);
    assert.equal(fleetSummary.operatingProfit, 6000);
  });

  it("RECONCILES with the single number on the dashboard", () => {
    // The whole fleet view is worthless if it does not tie back to this.
    const overall = summarizePeriod(loads, expenses, august, settings);
    assert.equal(fleetSummary.operatingProfit, overall.netProfit);
    assert.equal(fleetSummary.revenue, overall.grossRevenue);
    assert.equal(
      Math.round((fleetSummary.directCosts + fleetSummary.overhead) * 100) / 100,
      overall.operatingExpenses,
    );
  });

  it("reports the overhead allocation separately from any unit's own cost", () => {
    // 1500 over 5000 miles.
    assert.equal(fleetSummary.overheadPerMile, 0.3);
    const unit101 = fleetSummary.units.find((u) => u.truck.id === "t1")!;
    // The unit's own cost per mile knows nothing about it.
    assert.equal(unit101.directCostPerMile, 4000 / 3000);
  });

  it("ranks units by what they contribute", () => {
    assert.equal(fleetSummary.units[0].truck.id, "t1");
    const { best, weakest } = fleetExtremes(fleetSummary);
    assert.equal(best?.truck.id, "t1");
    assert.equal(weakest?.truck.id, "t2");
  });

  it("says it is not meaningful when only one unit actually ran", () => {
    const solo = calculateFleetSummary(fleet, [loads[0]], expenses, august, settings);
    assert.equal(solo.meaningful, false);
    assert.equal(fleetExtremes(solo).weakest, undefined);
  });

  it("survives a truck that ran nothing without producing NaN", () => {
    const idle = calculateFleetSummary(fleet, [loads[0]], [expenses[0]], august, settings);
    const unit102 = idle.units.find((u) => u.truck.id === "t2")!;
    assert.equal(unit102.contribution, 0);
    assert.equal(unit102.contributionPerMile, 0);
    assert.ok(Number.isFinite(unit102.deadheadPct));
  });

  it("still reconciles when a unit loses money", () => {
    const bad = [...expenses, expense({ id: "e3", truckId: "t2", amount: 5000 })];
    const s = calculateFleetSummary(fleet, loads, bad, august, settings);
    const overall = summarizePeriod(loads, bad, august, settings);
    assert.ok(s.units.find((u) => u.truck.id === "t2")!.contribution < 0);
    assert.equal(s.operatingProfit, overall.netProfit);
  });
});
