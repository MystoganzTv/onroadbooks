import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  analyzeDeadhead,
  brokerPerformance,
  div,
  linkedFuelByLoad,
  loadMetrics,
  moneyBreakdown,
  rateLoad,
  roundMoney,
  summarizeFuel,
  summarizePeriod,
  thresholdsFromSettings,
  withMetricsAll,
} from "../calculations";
import { resolvePeriod } from "../periods";
import type { Expense, FinancialSettings, FuelEntry, Load } from "../types";

const settings: FinancialSettings = {
  id: "s", businessId: "b", taxReservePct: 20, maintenanceReservePct: 5,
  categoryBehavior: {}, ratingGreatPerMile: 2, ratingGoodPerMile: 1.5,
  ratingMarginalPerMile: 1, deadheadWarnPct: 20, maintenanceWarnMiles: 2000,
  maintenanceWarnDays: 30, updatedAt: "",
  iftaTaxRates: {},
};

function load(over: Partial<Load> = {}): Load {
  return {
    id: "l", businessId: "b", truckId: "t", date: "2026-08-05",
    deliveryDate: null, equipmentType: null, loadCapacity: null,
    endingOdometer: null, equipmentLengthFt: null, weightLbs: null, commodity: null,
    originCity: "A", originState: "VA", destinationCity: "B", destinationState: "MD",
    broker: "Acme", loadNumber: null, loadedMiles: 100, deadheadMiles: 0, grossRate: 500,
    fuelCost: 0, tolls: 0, dispatchFee: 0, factoringFee: 0, otherExpenses: 0,
    driverId: null, driverPay: 0, costsPosted: false, status: "PAID",
    jurisdictionMiles: [], invoiceNumber: null, invoiceDate: null, invoiceDueDate: null,
    invoicePaidDate: null, billToName: null, billToEmail: null, billToAddress: null,
    invoiceNotes: null, notes: null, createdAt: "", ...over,
  };
}

function expense(over: Partial<Expense> = {}): Expense {
  return {
    id: "e", businessId: "b", truckId: "t", scope: "TRUCK", loadId: null, date: "2026-08-05",
    category: "OTHER", description: "x", vendor: null, amount: 100, recurring: false,
    receiptNumber: null, notes: null, createdAt: "", ...over,
  };
}

describe("div", () => {
  it("never returns Infinity or NaN", () => {
    assert.equal(div(1, 0), 0);
    assert.equal(div(0, 0), 0);
    assert.equal(div(Number.NaN, 5), 0);
    assert.equal(div(5, Number.NaN), 0);
    assert.equal(div(10, 4), 2.5);
  });
});

describe("roundMoney", () => {
  it("rounds half away from zero, symmetrically", () => {
    assert.equal(roundMoney(2.675), 2.68);
    assert.equal(roundMoney(-2.675), -2.68);
  });
  it("rounds the half cent up at every magnitude, not just below $2", () => {
    // Each of these is x.xx5 in decimal but sits just BELOW the half in
    // binary floating point; the old Number.EPSILON nudge was too small to
    // rescue them and they rounded down.
    assert.equal(roundMoney(1.005), 1.01);
    assert.equal(roundMoney(10.075), 10.08);
    assert.equal(roundMoney(8.575), 8.58);
    assert.equal(roundMoney(1.255), 1.26);
    assert.equal(roundMoney(-1.005), -1.01);
    // And a genuine below-half value still rounds down.
    assert.equal(roundMoney(1.0049), 1.0);
  });
  it("never produces negative zero", () => {
    assert.ok(Object.is(roundMoney(-0.004), 0));
    assert.ok(Object.is(roundMoney(-0), 0));
  });
  it("coerces non-finite input to zero", () => {
    assert.equal(roundMoney(Number.NaN), 0);
    assert.equal(roundMoney(Number.POSITIVE_INFINITY), 0);
  });
});

describe("loadMetrics", () => {
  it("divides profit by TOTAL miles, not loaded miles", () => {
    const m = loadMetrics(load({ loadedMiles: 100, deadheadMiles: 100, grossRate: 400 }));
    assert.equal(m.totalMiles, 200);
    assert.equal(m.revenuePerLoadedMile, 4);
    assert.equal(m.revenuePerTotalMile, 2);
    assert.equal(m.profitPerMile, 2);
  });

  it("counts every trip cost", () => {
    const m = loadMetrics(load({
      grossRate: 1000, fuelCost: 100, tolls: 50, dispatchFee: 50,
      factoringFee: 25, otherExpenses: 25, loadedMiles: 500,
    }));
    assert.equal(m.tripExpenses, 250);
    assert.equal(m.tripProfit, 750);
  });

  it("survives a row missing a fee column", () => {
    const broken = { ...load({ grossRate: 1000, loadedMiles: 100 }) } as Load;
    delete (broken as Partial<Load>).otherExpenses;
    const m = loadMetrics(broken);
    assert.equal(m.tripExpenses, 0);
    assert.equal(m.tripProfit, 1000);
    assert.equal(m.rating, "GREAT");
  });

  it("rates on profit per total mile, so deadhead can sink a high rate", () => {
    // The load board shows $4.00/loaded mile against $3.00/loaded mile. Once
    // the 300 empty miles are counted the "better" load pays $1.00 per mile
    // driven and the plain one pays $3.00.
    const clean = loadMetrics(load({ grossRate: 300, loadedMiles: 100, deadheadMiles: 0 }));
    const dirty = loadMetrics(load({ grossRate: 400, loadedMiles: 100, deadheadMiles: 300 }));
    assert.equal(clean.revenuePerLoadedMile, 3);
    assert.equal(dirty.revenuePerLoadedMile, 4); // the better-looking rate
    assert.equal(clean.profitPerMile, 3);
    assert.equal(dirty.profitPerMile, 1);
    assert.equal(clean.rating, "GREAT");
    assert.equal(dirty.rating, "MARGINAL"); // but the worse load
  });
});

describe("rateLoad", () => {
  it("uses the configured thresholds", () => {
    const t = thresholdsFromSettings(settings);
    assert.equal(rateLoad(2.0, t), "GREAT");
    assert.equal(rateLoad(1.99, t), "GOOD");
    assert.equal(rateLoad(1.5, t), "GOOD");
    assert.equal(rateLoad(1.0, t), "MARGINAL");
    assert.equal(rateLoad(0.99, t), "BAD");
    assert.equal(rateLoad(-5, t), "BAD");
  });
});

describe("summarizePeriod", () => {
  const loads = [
    load({ id: "a", date: "2026-08-03", grossRate: 1000, loadedMiles: 400, deadheadMiles: 100 }),
    load({ id: "b", date: "2026-08-20", grossRate: 500, loadedMiles: 200, deadheadMiles: 50 }),
    load({ id: "c", date: "2026-09-01", grossRate: 999, loadedMiles: 100 }),
  ];
  const expenses = [
    expense({ id: "x", date: "2026-08-01", amount: 300 }),
    expense({ id: "y", date: "2026-08-31", amount: 200 }),
    expense({ id: "z", date: "2026-07-31", amount: 999 }),
  ];

  it("includes only rows dated inside the range", () => {
    const s = summarizePeriod(loads, expenses, resolvePeriod("2026-08", "full"), settings);
    assert.equal(s.grossRevenue, 1500);
    assert.equal(s.operatingExpenses, 500);
    assert.equal(s.netProfit, 1000);
    assert.equal(s.loadCount, 2);
  });

  it("separates earned revenue, dated collections, receivables and debt service", () => {
    const s = summarizePeriod(
      [
        load({
          id: "earned-unpaid",
          date: "2026-08-03",
          grossRate: 2500,
          status: "INVOICED",
        }),
        load({
          id: "prior-paid-now",
          date: "2026-07-20",
          grossRate: 1800,
          status: "PAID",
          invoicePaidDate: "2026-08-10",
        }),
        load({
          id: "legacy-paid",
          date: "2026-08-08",
          grossRate: 900,
          status: "PAID",
          invoicePaidDate: null,
        }),
      ],
      [
        expense({ id: "ops", amount: 400, category: "INSURANCE" }),
        expense({ id: "interest", amount: 100, category: "INTEREST_EXPENSE" }),
        expense({ id: "principal", amount: 600, category: "PRINCIPAL_PAYMENT" }),
        expense({ id: "legacy-debt", amount: 200, category: "TRUCK_PAYMENT" }),
      ],
      resolvePeriod("2026-08", "full"),
      settings,
    );

    assert.equal(s.bookedRevenue, 3400);
    assert.equal(s.collectedRevenue, 1800);
    assert.equal(s.accountsReceivable, 2500);
    assert.equal(s.unallocatedCollectedRevenue, 900);
    assert.equal(s.operatingExpenses, 400);
    assert.equal(s.operatingProfit, 3000);
    assert.equal(s.interestExpense, 100);
    assert.equal(s.principalPayment, 600);
    assert.equal(s.unallocatedDebtService, 200);
    assert.equal(s.debtService, 900);
    assert.equal(s.cashAfterDebtService, 500);
  });

  it("halves sum exactly to the full month", () => {
    const first = summarizePeriod(loads, expenses, resolvePeriod("2026-08", "first"), settings);
    const second = summarizePeriod(loads, expenses, resolvePeriod("2026-08", "second"), settings);
    const full = summarizePeriod(loads, expenses, resolvePeriod("2026-08", "full"), settings);

    assert.equal(first.grossRevenue + second.grossRevenue, full.grossRevenue);
    assert.equal(first.operatingExpenses + second.operatingExpenses, full.operatingExpenses);
    assert.equal(first.netProfit + second.netProfit, full.netProfit);
    assert.equal(first.totalMiles + second.totalMiles, full.totalMiles);
  });

  it("is safe with no data at all", () => {
    const s = summarizePeriod([], [], resolvePeriod("2026-08", "full"), settings);
    for (const value of Object.values(s)) assert.ok(Number.isFinite(value));
    assert.equal(s.netMargin, 0);
    assert.equal(s.costPerMile, 0);
  });
});

describe("moneyBreakdown", () => {
  it("follows the stated formula", () => {
    const s = summarizePeriod(
      [load({ grossRate: 10000, loadedMiles: 1000 })],
      [expense({ amount: 4000 })],
      resolvePeriod("2026-08", "full"),
      settings,
    );
    const b = moneyBreakdown(s, settings);
    assert.equal(b.operatingProfit, 6000);
    assert.equal(b.taxReserve, 1200); // 20% of operating profit
    assert.equal(b.maintenanceReserve, 500); // 5% of Booked Revenue
    assert.equal(b.availableCash, 4300);
  });

  it("floors the tax reserve at zero in a loss, but still reserves maintenance", () => {
    const s = summarizePeriod(
      [load({ grossRate: 1000, loadedMiles: 100 })],
      [expense({ amount: 3000 })],
      resolvePeriod("2026-08", "full"),
      settings,
    );
    const b = moneyBreakdown(s, settings);
    assert.equal(b.operatingProfit, -2000);
    assert.equal(b.taxReserve, 0);
    assert.equal(b.maintenanceReserve, 50);
    assert.equal(b.availableCash, -2050);
  });
});

describe("analyzeDeadhead", () => {
  it("prices empty miles at the variable cost per mile", () => {
    const s = summarizePeriod(
      [load({ grossRate: 1000, loadedMiles: 800, deadheadMiles: 200 })],
      [expense({ amount: 500, category: "FUEL" })],
      resolvePeriod("2026-08", "full"),
      settings,
    );
    const d = analyzeDeadhead(s, settings);
    assert.equal(d.deadheadPct, 20);
    assert.equal(d.elevated, false); // exactly at the threshold is not over it
    assert.equal(d.deadheadCost, 100); // 200 mi x $0.50 variable cost per mile
    assert.equal(d.costPerTotalMile, 0.1);
  });

  it("honours a custom warning threshold", () => {
    const s = summarizePeriod(
      [load({ grossRate: 1000, loadedMiles: 900, deadheadMiles: 100 })],
      [],
      resolvePeriod("2026-08", "full"),
      settings,
    );
    assert.equal(analyzeDeadhead(s, { deadheadWarnPct: 5 }).elevated, true);
    assert.equal(analyzeDeadhead(s, { deadheadWarnPct: 50 }).elevated, false);
  });
});

describe("brokerPerformance", () => {
  it("orders by trip profit but rates on profit per mile driven", () => {
    const rows = withMetricsAll([
      load({ id: "1", broker: "Flashy", grossRate: 800, loadedMiles: 200, deadheadMiles: 200 }),
      load({ id: "2", broker: "Steady", grossRate: 700, loadedMiles: 200, deadheadMiles: 20 }),
    ], thresholdsFromSettings(settings));

    // The table is ordered by how much money the broker actually produced.
    const [first, second] = brokerPerformance(rows, thresholdsFromSettings(settings));
    assert.equal(first.broker, "Flashy");
    assert.equal(first.tripProfit, 800);
    assert.equal(second.tripProfit, 700);

    // Flashy advertises the better rate per loaded mile...
    assert.equal(first.revenuePerLoadedMile, 4);
    assert.equal(second.revenuePerLoadedMile, 3.5);
    // ...but pays less per mile actually driven, and the rating says so.
    assert.equal(first.profitPerMile, 2);
    assert.ok(second.profitPerMile > first.profitPerMile);
    assert.equal(first.rating, "GREAT");
    assert.equal(second.rating, "GREAT");
    assert.ok(second.deadheadPct < first.deadheadPct);
  });

  it("groups unbrokered loads under one label", () => {
    const rows = withMetricsAll([load({ broker: null }), load({ id: "2", broker: "  " })]);
    const groups = brokerPerformance(rows);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].broker, "No broker");
  });
});

describe("linked fuel supersedes the load's own estimate", () => {
  const fill = (over: Partial<FuelEntry>): FuelEntry => ({
    id: "f", businessId: "b", truckId: "t", loadId: null, date: "2026-08-05",
    gallons: 100, pricePerGallon: 3.85, totalCost: 385, odometer: null,
    location: null, jurisdiction: null, expenseId: null, notes: null,
    createdAt: "2026-08-05T00:00:00.000Z", ...over,
  });

  // The ledger already drops a load's own fuel row once a real fill-up is
  // linked to it (reconcileLoadExpenseLedger). If the load's own profit kept
  // using the estimate, the same trip would report two different profits on
  // the same screen -- which is exactly what production did before this.
  it("prices the trip on the real fill-up, not the number typed on the load", () => {
    const trip = load({
      grossRate: 2100, loadedMiles: 660, deadheadMiles: 40,
      fuelCost: 280, tolls: 20, dispatchFee: 105, factoringFee: 63, otherExpenses: 32,
    });

    const estimated = loadMetrics(trip);
    assert.equal(estimated.tripExpenses, 500);
    assert.equal(estimated.tripProfit, 1600);

    const actual = loadMetrics(trip, undefined, 385);
    assert.equal(actual.tripExpenses, 605);
    assert.equal(actual.tripProfit, 1495);
    assert.equal(roundMoney(actual.profitPerMile), 2.14);
  });

  it("can turn a load that looked great into one that is merely good", () => {
    // $1,600 over 700 total miles. On the $100 estimate the trip keeps
    // $2.14/mi and rates GREAT; on the $400 that actually went in the tank it
    // keeps $1.71/mi, which is only GOOD.
    const trip = load({
      grossRate: 1600, loadedMiles: 600, deadheadMiles: 100,
      fuelCost: 100, tolls: 0, dispatchFee: 0, factoringFee: 0, otherExpenses: 0,
    });
    assert.equal(loadMetrics(trip, thresholdsFromSettings(settings)).rating, "GREAT");
    assert.equal(loadMetrics(trip, thresholdsFromSettings(settings), 400).rating, "GOOD");
  });

  it("adds every fill-up linked to the same load and ignores unlinked ones", () => {
    const totals = linkedFuelByLoad([
      fill({ id: "f1", loadId: "l", totalCost: 190 }),
      fill({ id: "f2", loadId: "l", totalCost: 385 }),
      fill({ id: "f3", loadId: null, totalCost: 999 }),
      fill({ id: "f4", loadId: "other", totalCost: 50 }),
    ]);
    assert.equal(totals.get("l"), 575);
    assert.equal(totals.get("other"), 50);
    assert.equal(totals.size, 2);
  });

  it("leaves a load with no linked fill-up on its own estimate", () => {
    const totals = linkedFuelByLoad([fill({ loadId: null })]);
    const trip = load({ grossRate: 1000, loadedMiles: 500, fuelCost: 200 });
    const m = loadMetrics(trip, undefined, totals.get(trip.id));
    assert.equal(m.tripExpenses, 200);
    assert.equal(m.tripProfit, 800);
  });

  it("treats a linked fill-up of zero as the real number, not as missing", () => {
    const trip = load({ grossRate: 1000, loadedMiles: 500, fuelCost: 200 });
    const m = loadMetrics(trip, undefined, 0);
    assert.equal(m.tripExpenses, 0);
    assert.equal(m.tripProfit, 1000);
  });
});

describe("summarizeFuel", () => {
  const entry = (over: Partial<FuelEntry>): FuelEntry => ({
    id: "f",
    businessId: "b",
    truckId: "t1",
    loadId: null,
    date: "2026-08-01",
    gallons: 100,
    pricePerGallon: 4,
    totalCost: 400,
    odometer: null,
    location: null,
    jurisdiction: null,
    expenseId: null,
    notes: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...over,
  });

  it("derives MPG from one truck's odometer span, excluding the first fill", () => {
    const fuel = summarizeFuel(
      [
        entry({ id: "a", odometer: 150000, gallons: 90 }),
        entry({ id: "b", odometer: 150700, gallons: 100, date: "2026-08-10" }),
      ],
      1400,
    );
    // 700 miles on the 100 gallons bought at the second stop.
    assert.equal(fuel.milesPerGallon, 7);
    assert.equal(fuel.odometerMiles, 700);
  });

  it("never subtracts one truck's odometer from another's", () => {
    // Two trucks, each genuinely at 7 MPG. The old implementation sorted all
    // readings together and computed (150700 - 80000) / gallons = 235 MPG.
    const fuel = summarizeFuel(
      [
        entry({ id: "a", truckId: "t1", odometer: 150000 }),
        entry({ id: "b", truckId: "t1", odometer: 150700, date: "2026-08-10" }),
        entry({ id: "c", truckId: "t2", odometer: 80000 }),
        entry({ id: "d", truckId: "t2", odometer: 80700, date: "2026-08-11" }),
      ],
      2800,
    );
    assert.equal(fuel.milesPerGallon, 7);
    assert.equal(fuel.odometerMiles, 1400);
  });

  it("reports no MPG while any single truck has fewer than two readings", () => {
    const fuel = summarizeFuel(
      [
        entry({ id: "a", truckId: "t1", odometer: 150000 }),
        entry({ id: "b", truckId: "t2", odometer: 80000 }),
      ],
      700,
    );
    assert.equal(fuel.milesPerGallon, null);
    assert.equal(fuel.odometerMiles, null);
  });

  it("totals cost and gallons regardless of odometer data", () => {
    const fuel = summarizeFuel([entry({ id: "a" }), entry({ id: "b", totalCost: 300.5 })], 1000);
    assert.equal(fuel.totalCost, 700.5);
    assert.equal(fuel.totalGallons, 200);
    assert.equal(fuel.entryCount, 2);
  });
});
