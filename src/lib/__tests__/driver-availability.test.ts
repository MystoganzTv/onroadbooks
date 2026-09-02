import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findDriverScheduleConflicts,
  type DriverScheduleEntry,
} from "../driver-availability";

function assignment(over: Partial<DriverScheduleEntry> = {}): DriverScheduleEntry {
  return {
    loadId: "load-1",
    driverId: "raul",
    truckId: "toro",
    pickupDate: "2026-09-10",
    deliveryDate: "2026-09-12",
    loadNumber: "OR-101",
    originCity: "Miami",
    originState: "FL",
    destinationCity: "Atlanta",
    destinationState: "GA",
    ...over,
  };
}

describe("driver schedule conflicts", () => {
  it("warns when the same driver overlaps on another truck", () => {
    const conflicts = findDriverScheduleConflicts(
      [assignment()],
      {
        driverId: "raul",
        pickupDate: "2026-09-12",
        deliveryDate: "2026-09-13",
      },
    );

    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].truckId, "toro");
  });

  it("does not flag back-to-back days, another driver, or the load being edited", () => {
    const schedule = [
      assignment(),
      assignment({ loadId: "load-2", driverId: "maria" }),
    ];

    assert.deepEqual(
      findDriverScheduleConflicts(schedule, {
        driverId: "raul",
        pickupDate: "2026-09-13",
        deliveryDate: null,
      }),
      [],
    );
    assert.deepEqual(
      findDriverScheduleConflicts(schedule, {
        loadId: "load-1",
        driverId: "raul",
        pickupDate: "2026-09-11",
        deliveryDate: "2026-09-12",
      }),
      [],
    );
  });

  it("treats a missing delivery date as a one-day assignment", () => {
    const conflicts = findDriverScheduleConflicts(
      [assignment({ deliveryDate: null })],
      {
        driverId: "raul",
        pickupDate: "2026-09-10",
        deliveryDate: null,
      },
    );

    assert.equal(conflicts.length, 1);
  });
});
