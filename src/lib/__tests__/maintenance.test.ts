import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeDue, suggestNextService, thresholdsFrom, upcomingMaintenance } from "../maintenance";
import type { FinancialSettings, MaintenanceRecord, Truck } from "../types";

const T = { warnMiles: 2000, warnDays: 30 };
const TODAY = "2026-08-29";

function record(over: Partial<MaintenanceRecord> = {}): MaintenanceRecord {
  return {
    id: "m", businessId: "b", truckId: "t", type: "OIL_CHANGE", basis: "BOTH",
    serviceDate: "2026-05-22", odometer: 136030, cost: 0, vendor: null,
    nextServiceDate: null, nextServiceOdometer: null, expenseId: null,
    notes: null, createdAt: "", ...over,
  };
}

const truck = { id: "t", currentOdometer: 144780 } as Truck;

describe("computeDue", () => {
  it("flags overdue on either measure", () => {
    const byMiles = computeDue(record({ basis: "MILEAGE", nextServiceOdometer: 140000 }), 144780, TODAY, T);
    assert.equal(byMiles.status, "OVERDUE");
    assert.match(byMiles.summary, /Overdue by 4,780 miles/);

    const byDate = computeDue(record({ basis: "DATE", nextServiceDate: "2026-07-10" }), 144780, TODAY, T);
    assert.equal(byDate.status, "OVERDUE");
    assert.match(byDate.summary, /Overdue by 50 days/);
  });

  it("BOTH takes whichever comes first", () => {
    const due = computeDue(
      record({ basis: "BOTH", nextServiceDate: "2027-06-01", nextServiceOdometer: 145000 }),
      144780, TODAY, T,
    );
    assert.equal(due.status, "DUE_SOON"); // 220 miles away, though the date is far off
  });

  it("names the measure that is actually urgent, not the far-off one", () => {
    const due = computeDue(
      record({ basis: "BOTH", nextServiceDate: "2026-09-23", nextServiceOdometer: 153780 }),
      144780, TODAY, T,
    );
    assert.equal(due.status, "DUE_SOON");
    assert.equal(due.summary, "Due in 25 days"); // not "Due in 9,000 miles"
  });

  it("uses renewal wording for registration and insurance", () => {
    const due = computeDue(
      record({ type: "INSURANCE", basis: "DATE", nextServiceDate: "2026-10-10" }),
      144780, TODAY, T,
    );
    assert.equal(due.summary, "Renews in 42 days");
  });

  it("ignores the measure its basis excludes", () => {
    const dateOnly = computeDue(
      record({ basis: "DATE", nextServiceDate: "2027-01-01", nextServiceOdometer: 100 }),
      144780, TODAY, T,
    );
    assert.equal(dateOnly.status, "OK");
    assert.equal(dateOnly.milesRemaining, null);
  });

  it("reports nothing scheduled rather than guessing", () => {
    const due = computeDue(record({ basis: "BOTH" }), 144780, TODAY, T);
    assert.equal(due.status, "UNSCHEDULED");
  });
});

describe("thresholdsFrom", () => {
  it("keeps a zero threshold instead of treating it as unset", () => {
    const settings = { maintenanceWarnMiles: 0, maintenanceWarnDays: 0 } as FinancialSettings;
    assert.deepEqual(thresholdsFrom(settings), { warnMiles: 0, warnDays: 0 });
  });
  it("falls back only when genuinely absent", () => {
    assert.deepEqual(thresholdsFrom({} as FinancialSettings), { warnMiles: 2000, warnDays: 30 });
  });
});

describe("upcomingMaintenance", () => {
  it("sorts overdue first, then by urgency against the thresholds", () => {
    const due = upcomingMaintenance([
      record({ id: "1", type: "TIRES", basis: "MILEAGE", nextServiceOdometer: 184400 }),
      record({ id: "2", type: "COOLANT", basis: "DATE", nextServiceDate: "2026-07-10" }),
      record({ id: "3", type: "DOT_INSPECTION", basis: "DATE", nextServiceDate: "2026-09-21" }),
    ], truck, TODAY, T);

    assert.deepEqual(due.map((d) => d.type), ["COOLANT", "DOT_INSPECTION", "TIRES"]);
    assert.equal(due[0].status, "OVERDUE");
    assert.equal(due[1].status, "DUE_SOON");
    assert.equal(due[2].status, "OK");
  });

  it("does not let a newer unscheduled record hide a scheduled one", () => {
    const due = upcomingMaintenance([
      record({ id: "old", type: "BRAKES", basis: "MILEAGE", serviceDate: "2026-01-01", nextServiceOdometer: 145000 }),
      record({ id: "new", type: "BRAKES", basis: "MILEAGE", serviceDate: "2026-06-01" }),
    ], truck, TODAY, T);

    assert.equal(due.length, 1);
    assert.equal(due[0].record.id, "old");
  });
});

describe("suggestNextService", () => {
  it("treats odometer 0 as a real reading", () => {
    const s = suggestNextService("TIRES", "2026-08-29", 0);
    assert.equal(s.nextServiceOdometer, 60000);
  });
  it("returns null when the type has no interval for that measure", () => {
    const s = suggestNextService("TIRES", "2026-08-29", 1000);
    assert.equal(s.nextServiceDate, null);
    assert.equal(s.basis, "MILEAGE");
  });
});
