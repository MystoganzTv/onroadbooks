import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadMetrics, thresholdsFromSettings, tripExpenseLines } from "../calculations";
import { loadExpenseSpecs, reconcileLoadExpenseLedger } from "../load-expenses";
import { loadSchema } from "../schemas";
import type { Dataset, FinancialSettings, Load } from "../types";

const settings: FinancialSettings = {
  id: "s", businessId: "b", taxReservePct: 20, maintenanceReservePct: 5,
  categoryBehavior: {}, ratingGreatPerMile: 2, ratingGoodPerMile: 1.5,
  ratingMarginalPerMile: 1, deadheadWarnPct: 20, maintenanceWarnMiles: 2000,
  maintenanceWarnDays: 30, updatedAt: "", iftaTaxRates: {},
};

function load(over: Partial<Load> = {}): Load {
  return {
    id: "l1", businessId: "b", truckId: "t", date: "2026-09-25",
    deliveryDate: null, equipmentType: null, loadCapacity: null,
    endingOdometer: null, equipmentLengthFt: null, weightLbs: null, commodity: null,
    originCity: "National Harbor", originState: "MD", destinationCity: "Cincinnati", destinationState: "OH",
    broker: "TQL", loadNumber: "38525680", loadedMiles: 500, deadheadMiles: 0, grossRate: 575,
    fuelCost: 0, tolls: 0, dispatchFee: 0, factoringFee: 0, otherExpenses: 0,
    claimDeduction: 28.75, claimReason: "Rotura",
    driverId: null, driverPay: 0, costsPosted: true, status: "PAID",
    jurisdictionMiles: [], invoiceNumber: null, invoiceDate: null, invoiceDueDate: null,
    invoicePaidDate: null, billToName: null, billToEmail: null, billToAddress: null,
    invoiceNotes: null, notes: null, createdAt: "", ...over,
  };
}

describe("broker deduction (short pay after delivery)", () => {
  it("is a trip cost: 575 rate with a 28.75 deduction contributes 546.25", () => {
    const row = load();
    const claims = tripExpenseLines(row).find((line) => line.key === "claims");
    assert.equal(claims?.amount, 28.75);
    const metrics = loadMetrics(row, thresholdsFromSettings(settings));
    assert.equal(metrics.tripExpenses, 28.75);
    assert.equal(metrics.tripProfit, 546.25);
  });

  it("an older record without the field reads as no deduction", () => {
    const row = load();
    delete row.claimDeduction;
    delete row.claimReason;
    assert.equal(tripExpenseLines(row).find((line) => line.key === "claims")?.amount, 0);
  });

  it("posts to the ledger as OTHER, named by PO and reason, and only when non-zero", () => {
    const spec = loadExpenseSpecs(load()).find((item) => item.key === "claims");
    assert.equal(spec?.category, "OTHER");
    assert.equal(spec?.amount, 28.75);
    const dataset = { business: { id: "b" }, loads: [load()], expenses: [], fuelEntries: [] } as unknown as Dataset;
    reconcileLoadExpenseLedger(dataset);
    const posted = dataset.expenses.find((row) => row.id === "expload_l1_claims");
    assert.equal(posted?.amount, 28.75);
    assert.equal(posted?.description, "PO# 38525680 · Broker deduction - Rotura");

    dataset.loads[0].claimDeduction = 0;
    reconcileLoadExpenseLedger(dataset);
    assert.equal(dataset.expenses.some((row) => row.id === "expload_l1_claims"), false);
  });

  it("the schema refuses a deduction larger than the rate", () => {
    const base = {
      date: "2026-09-25", originCity: "A", originState: "MD", destinationCity: "B", destinationState: "OH",
      loadedMiles: 500, deadheadMiles: 0, grossRate: 575, fuelCost: 0, tolls: 0, dispatchFee: 0,
      factoringFee: 0, otherExpenses: 0, status: "PAID" as const,
    };
    assert.equal(loadSchema.safeParse({ ...base, claimDeduction: 28.75, claimReason: "Rotura" }).success, true);
    assert.equal(loadSchema.safeParse({ ...base, claimDeduction: 600 }).success, false);
    assert.equal(loadSchema.safeParse(base).success, true);
  });
});
