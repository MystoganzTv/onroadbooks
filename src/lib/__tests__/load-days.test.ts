import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { driverPayForLoad, fixedCostPerDay, loadDays, loadPerDay } from "../finance/load-days";
import { buildSeedDataset } from "../seed/seed-data";
import type { Driver, Expense, Load } from "../types";

const base = buildSeedDataset().loads[0];

// Glendale -> Chicago (Wed 21 - Fri 23), Saturday idle, Chicago -> Glendale (Sun 25 - Tue 27).
function glendale(over: Partial<Load> = {}): Load {
  return {
    ...base, id: "g", truckId: "t1", date: "2026-10-21", deliveryDate: "2026-10-23", grossRate: 3385, detentionPay: 300,
    loadedMiles: 1600, deadheadMiles: 0, driverId: null, driverPay: 0,
    extraLegs: [{ pickupDate: "2026-10-25", deliveryDate: "2026-10-27", originCity: "Chicago", originState: "IL", destinationCity: "Glendale", destinationState: "NY", miles: 800 }],
    ...over,
  };
}

describe("load days", () => {
  it("counts first pickup to last delivery, and the day between legs as idle", () => {
    const days = loadDays(glendale());
    assert.equal(days.complete, true);
    assert.equal(days.busyDays, 7);
    assert.equal(days.loadedDays, 6);
    assert.equal(days.idleDays, 1);
    assert.deepEqual(days.days.map((day) => day.kind), ["PICKUP", "IN_TRANSIT", "DELIVERY", "IDLE", "PICKUP", "IN_TRANSIT", "DELIVERY"]);
    assert.deepEqual(days.days.map((day) => day.leg), [1, 1, 1, null, 2, 2, 2]);
  });

  it("marks a delivery and the next pickup on the same day as one handoff day", () => {
    const leg = glendale().extraLegs![0];
    const days = loadDays(glendale({ extraLegs: [{ ...leg, pickupDate: "2026-10-23", deliveryDate: "2026-10-24" }] }));
    assert.equal(days.busyDays, 4);
    assert.equal(days.idleDays, 0);
    assert.equal(days.days[2].kind, "HANDOFF");
  });

  it("a same-day load is one day; no delivery date anywhere is incomplete", () => {
    assert.equal(loadDays(glendale({ deliveryDate: "2026-10-21", extraLegs: [] })).busyDays, 1);
    assert.equal(loadDays(glendale({ deliveryDate: "2026-10-21", extraLegs: [] })).days[0].kind, "PICKUP_DELIVERY");
    assert.equal(loadDays(glendale({ deliveryDate: null, extraLegs: [] })).complete, false);
  });
});

describe("per-day money", () => {
  const driver = { id: "d1", payType: "PERCENT_GROSS", payRate: 33 } as Driver;
  const bill = (over: Partial<Expense>): Expense => ({ ...buildSeedDataset().expenses[0], recurring: true, notes: null, truckId: "t1", date: "2026-10-01", ...over });

  it("driver pay is the frozen figure once paid, otherwise the driver's rule on the rate (not detention)", () => {
    assert.equal(driverPayForLoad(glendale({ driverId: "d1" }), [driver]), 1117.05);
    assert.equal(driverPayForLoad(glendale({ driverId: "d1", driverPay: 1200 }), [driver]), 1200);
    assert.equal(driverPayForLoad(glendale(), [driver]), 0);
  });

  it("fixed cost per day is this truck's and the business's monthly bills x12 / 365", () => {
    const expenses = [
      bill({ id: "ins", description: "Insurance", amount: 1200, truckId: null }),
      bill({ id: "note", description: "Truck note", amount: 2450 }),
      bill({ id: "other", description: "Other truck", amount: 999, truckId: "t2" }),
      bill({ id: "once", description: "One-off", amount: 500, recurring: false }),
    ];
    const fixed = fixedCostPerDay(expenses, "t1", "2026-10-29");
    assert.equal(fixed.monthly, 3650);
    assert.equal(fixed.perDay, 120);
    assert.deepEqual(fixed.bills.sort(), ["Insurance", "Truck note"]);
  });

  it("profit per day divides what the load left after the driver by the busy days", () => {
    const perDay = loadPerDay({
      load: glendale({ driverId: "d1" }),
      tripProfit: 2618.8,
      drivers: [driver],
      expenses: [bill({ id: "note", description: "Truck note", amount: 3650 })],
      today: "2026-10-29",
    });
    assert.equal(perDay.profit, 1501.75);
    assert.equal(perDay.profitPerDay, 214.54);
    assert.equal(perDay.leftPerDay, 94.54);
  });
});
