import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadSchema } from "../schemas";

const validLoad = {
  date: "2026-08-30",
  deliveryDate: "2026-08-31",
  endingOdometer: 267_840,
  originCity: "Dallas",
  originState: "TX",
  destinationCity: "Atlanta",
  destinationState: "GA",
  broker: "LST Group LLC",
  loadNumber: "DAT-784",
  equipmentType: "DRY_VAN" as const,
  loadCapacity: "FULL" as const,
  equipmentLengthFt: 53,
  weightLbs: 35_000,
  commodity: "General freight",
  loadedMiles: 784,
  deadheadMiles: 0,
  grossRate: 2400,
  fuelCost: 0,
  tolls: 0,
  dispatchFee: 0,
  factoringFee: 0,
  otherExpenses: 0,
  costsPosted: true,
  status: "PENDING" as const,
  notes: null,
};

describe("loadSchema operational details", () => {
  it("accepts DAT-style load details", () => {
    const parsed = loadSchema.safeParse(validLoad);
    assert.equal(parsed.success, true);
  });

  it("rejects delivery before pickup", () => {
    const parsed = loadSchema.safeParse({ ...validLoad, deliveryDate: "2026-08-29" });
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      assert.equal(parsed.error.flatten().fieldErrors.deliveryDate?.[0], "Delivery cannot be before pickup");
    }
  });
});
