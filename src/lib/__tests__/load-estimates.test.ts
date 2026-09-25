import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMetrics, tripExpenseLines } from "../calculations";
import { buildLoadEstimator } from "../load-estimates";
import { buildSeedDataset } from "../seed/seed-data";
import type { Dataset, Driver, DriverSettlement, Expense, Load } from "../types";

function fixture() {
  const seed = buildSeedDataset();
  const truckId = seed.trucks[0].id;
  const base = seed.loads[0];
  const load = (id: string, date: string, miles: number, extra: Partial<Load> = {}): Load => ({
    ...base, id, truckId, date, loadedMiles: miles, deadheadMiles: 0, grossRate: 1000,
    fuelCost: 0, tolls: 0, dispatchFee: 0, factoringFee: 0, otherExpenses: 0,
    driverPay: 0, driverId: null, costsPosted: true, ...extra,
  });
  const fuel = (id: string, date: string, amount: number): Expense => ({
    ...seed.expenses[0], id, date, amount, truckId, scope: "TRUCK", loadId: null,
    category: "FUEL", financialTreatment: "OPERATING", recurring: false,
  });
  const driver: Driver = {
    id: "drv", businessId: seed.business.id, name: "Driver", reference: null,
    defaultTruckId: truckId, payType: "PERCENT_GROSS", payRate: 33, active: true,
    createdAt: "2026-09-01T00:00:00.000Z",
  };
  const dataset: Dataset = {
    ...seed,
    loads: [load("a", "2026-09-10", 400), load("b", "2026-09-12", 600)],
    expenses: [fuel("f1", "2026-09-10", 300), fuel("f2", "2026-09-12", 280)],
    drivers: [driver],
    driverSettlements: [],
  };
  return { dataset, load, driver };
}

describe("trip cost estimates", () => {
  it("charges a load its miles at the truck's recent fuel cost per mile", () => {
    const { dataset, load } = fixture();
    const estimate = buildLoadEstimator(dataset, "2026-09-20");
    const trip = load("t", "2026-09-15", 308);
    // $580 of fuel over 1,000 miles.
    assert.deepEqual(estimate(trip), { fuelCost: 178.64, fuelPerMile: 0.58 });
    const lines = tripExpenseLines(trip, [], estimate(trip));
    assert.deepEqual(lines.find((line) => line.key === "fuel"), {
      key: "fuel", label: "Estimated fuel", amount: 178.64, estimated: true,
    });
    assert.equal(loadMetrics(trip, undefined, [], estimate(trip)).tripProfit, 821.36);
    // A fuel figure the owner entered on the load wins.
    assert.equal(estimate({ ...trip, fuelCost: 150 }).fuelCost, undefined);
  });

  it("does not guess fuel before the truck has enough miles behind it", () => {
    const { dataset, load } = fixture();
    dataset.loads = [load("a", "2026-09-10", 200)];
    assert.equal(buildLoadEstimator(dataset, "2026-09-20")(load("t", "2026-09-15", 308)).fuelCost, undefined);
  });

  it("expects the driver's pay from their terms until the settlement is paid", () => {
    const { dataset, load, driver } = fixture();
    const trip = load("t", "2026-09-15", 308, { grossRate: 300, driverId: driver.id });
    assert.equal(buildLoadEstimator(dataset, "2026-09-20")(trip).driverPay, 99);
    assert.equal(tripExpenseLines(trip, [], { driverPay: 99 }).find((l) => l.key === "driverPay")?.estimated, true);

    const statement = (status: DriverSettlement["status"], payAmount: number): DriverSettlement => ({
      id: "s", businessId: dataset.business.id, driverId: driver.id, periodStart: "2026-09-01",
      periodEnd: "2026-09-15", status, paidOn: status === "PAID" ? "2026-09-16" : null, notes: null,
      adjustments: [], createdAt: "2026-09-16T00:00:00.000Z",
      lines: [{ id: "l", settlementId: "s", loadId: trip.id, truckId: trip.truckId, grossRevenue: 300,
        loadedMiles: 308, totalMiles: 308, payType: "PERCENT_GROSS", payRate: 33, payAmount,
        expenseId: null, createdAt: "2026-09-16T00:00:00.000Z" }],
    });
    dataset.driverSettlements = [statement("DRAFT", 105)];
    assert.equal(buildLoadEstimator(dataset, "2026-09-20")(trip).driverPay, 105);
    dataset.driverSettlements = [statement("PAID", 105)];
    assert.equal(buildLoadEstimator(dataset, "2026-09-20")(trip).driverPay, undefined);
    // Paid pay is on the load itself and needs no estimate.
    assert.equal(buildLoadEstimator(dataset, "2026-09-20")({ ...trip, driverPay: 105 }).driverPay, undefined);
    // No driver on the load, nothing to expect.
    assert.equal(buildLoadEstimator(dataset, "2026-09-20")({ ...trip, driverId: null }).driverPay, undefined);
  });
});
