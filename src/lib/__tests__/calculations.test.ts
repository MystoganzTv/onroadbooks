import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  analyzeDeadhead,
  brokerPerformance,
  div,
  loadMetrics,
  moneyBreakdown,
  rateLoad,
  roundMoney,
  summarizePeriod,
  thresholdsFromSettings,
  withMetricsAll,
} from "../calculations";
import { resolvePeriod } from "../periods";
import type { Expense, FinancialSettings, Load } from "../types";

const settings: FinancialSettings = {
  id: "s", businessId: "b", taxReservePct: 20, maintenanceReservePct: 5,
  categoryBehavior: {}, ratingGreatPerMile: 2, ratingGoodPerMile: 1.5,
  ratingMarginalPerMile: 1, deadheadWarnPct: 20, maintenanceWarnMiles: 2000,
  maintenanceWarnDays: 30, updatedAt: "",
};

function load(over: Partial<Load> = {}): Load {
  return {
    id: "l", businessId: "b", truckId: "t", date: "2026-08-05",
    originCity: "A", originState: "VA", destinationCity: "B", destinationState: "MD",
    broker: "Acme", loadNumber: null, loadedMiles: 100, deadheadMiles: 0, grossRate: 500,
    fuelCost: 0, tolls: 0, dispatchFee: 0, factoringFee: 0, otherExpenses: 0,
    status: "PAID", notes: null, createdAt: "", ...over,
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
    assert.equal(b.maintenanceReserve, 500); // 5% of gross revenue
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
