import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMetrics, tripExpenseLines } from "../calculations";
import { buildLoadEstimator } from "../load-estimates";
import { buildSeedDataset } from "../seed/seed-data";
import type { Dataset, Driver, Expense, Load } from "../types";

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
    assert.deepEqual(estimate(trip), { fuelCost: 178.64, fuelPerMile: 0.58, fuelSource: "LEDGER" });
    const lines = tripExpenseLines(trip, [], estimate(trip));
    assert.deepEqual(lines.find((line) => line.key === "fuel"), {
      key: "fuel", label: "Estimated fuel", amount: 178.64, estimated: true,
    });
    assert.equal(loadMetrics(trip, undefined, [], estimate(trip)).tripProfit, 821.36);
    // A fuel figure the owner entered on the load wins.
    assert.equal(estimate({ ...trip, fuelCost: 150 }).fuelCost, undefined);
  });

  it("prices fuel by the gallon once the truck has a reference MPG", () => {
    const { dataset, load } = fixture();
    const truckId = dataset.trucks[0].id;
    dataset.trucks = dataset.trucks.map((truck) => (truck.id === truckId ? { ...truck, referenceMpg: 8.5 } : truck));
    dataset.fuelEntries = [
      { ...dataset.fuelEntries[0], id: "fe-old", truckId, date: "2026-08-01", gallons: 50, pricePerGallon: 5.9, totalCost: 295 },
      { ...dataset.fuelEntries[0], id: "fe-new", truckId, date: "2026-09-18", gallons: 48, pricePerGallon: 6.4, totalCost: 307.2 },
    ];
    const trip = load("t", "2026-09-15", 308);
    // 308 mi / 8.5 MPG x $6.40/gal -- the last fill-up, not the ledger's $0.58/mi.
    assert.deepEqual(buildLoadEstimator(dataset, "2026-09-20")(trip), {
      fuelCost: 231.91, fuelPerMile: 0.753, fuelSource: "MPG", fuelMpg: 8.5, fuelPricePerGallon: 6.4,
    });
    // Deadhead is fuel too: total miles, never loaded miles alone.
    assert.equal(buildLoadEstimator(dataset, "2026-09-20")({ ...trip, loadedMiles: 208, deadheadMiles: 100 }).fuelCost, 231.91);
  });

  it("falls back to the ledger when the truck has an MPG but no recent price", () => {
    const { dataset, load } = fixture();
    const truckId = dataset.trucks[0].id;
    dataset.trucks = dataset.trucks.map((truck) => (truck.id === truckId ? { ...truck, referenceMpg: 8.5 } : truck));
    dataset.fuelEntries = [];
    assert.equal(buildLoadEstimator(dataset, "2026-09-20")(load("t", "2026-09-15", 308)).fuelSource, "LEDGER");
  });

  it("does not guess fuel before the truck has enough miles behind it", () => {
    const { dataset, load } = fixture();
    dataset.loads = [load("a", "2026-09-10", 200)];
    assert.equal(buildLoadEstimator(dataset, "2026-09-20")(load("t", "2026-09-15", 308)).fuelCost, undefined);
  });

  it("never turns a driver's pay terms into a load cost", () => {
    const { dataset, load, driver } = fixture();
    const trip = load("t", "2026-09-15", 308, { grossRate: 300, driverId: driver.id, driverPay: 99 });
    assert.equal("driverPay" in buildLoadEstimator(dataset, "2026-09-20")(trip), false);
    assert.equal(tripExpenseLines(trip).some((line) => line.key === "driverPay"), false);
  });
});

describe("broker contacts", async () => {
  const { brokerContactNames } = await import("../broker-contacts");
  it("groups the agents booked with under their broker", () => {
    assert.deepEqual(
      brokerContactNames(
        [
          { broker: "TQL", brokerContact: "Michael Reagan" },
          { broker: "tql ", brokerContact: "Christopher Sanchez" },
          { broker: "TQL", brokerContact: " michael reagan" },
          { broker: "Coyote", brokerContact: null },
          { broker: null, brokerContact: "Nobody" },
        ],
        [{ name: "TQL", contactName: "Branden Elam" }],
      ),
      { tql: ["Branden Elam", "Christopher Sanchez", "Michael Reagan"] },
    );
  });
});
