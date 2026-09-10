import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cleanDate,
  cleanState,
  isEmptyExtraction,
  missingRequiredFields,
  normalizeExtraction,
  rateConExtractionSchema,
  type RateConExtraction,
} from "../rate-con/schema";

/**
 * Everything a model can get wrong about FORM while being right about the
 * DOCUMENT is corrected here, with no API key and no network. What it cannot
 * fix -- a rate that is simply not on the page -- has to end up as null, so
 * the owner sees an empty field instead of a confident wrong number.
 */

function extraction(overrides: Partial<Record<keyof RateConExtraction, unknown>> = {}) {
  return rateConExtractionSchema.parse({
    broker: "Coyote Logistics",
    loadNumber: "18827411",
    pickupDate: "2026-04-06",
    deliveryDate: "2026-04-08",
    originCity: "Laredo",
    originState: "TX",
    destinationCity: "Austell",
    destinationState: "GA",
    loadedMiles: 1404,
    grossRate: 4000,
    equipmentType: "DRY_VAN",
    equipmentLengthFt: 53,
    weightLbs: 42000,
    commodity: "Auto parts",
    ...overrides,
  });
}

describe("rate confirmation states", () => {
  it("accepts codes, full names and a code buried in a longer string", () => {
    assert.equal(cleanState("TX"), "TX");
    assert.equal(cleanState("tx"), "TX");
    assert.equal(cleanState("Texas"), "TX");
    assert.equal(cleanState("  new mexico "), "NM");
    assert.equal(cleanState("Ontario"), "ON");
    assert.equal(cleanState("Laredo, TX"), "TX");
    assert.equal(cleanState("TX 78045"), "TX");
  });

  it("refuses anything that is not a real jurisdiction", () => {
    assert.equal(cleanState("XX"), null);
    assert.equal(cleanState("N/A"), null);
    assert.equal(cleanState(""), null);
    assert.equal(cleanState(42), null);
  });
});

describe("rate confirmation dates", () => {
  it("keeps ISO and converts the US format the document prints", () => {
    assert.equal(cleanDate("2026-04-06"), "2026-04-06");
    assert.equal(cleanDate("04/06/2026"), "2026-04-06");
    assert.equal(cleanDate("4/6/26"), "2026-04-06");
  });

  it("drops a date it cannot read rather than guessing one", () => {
    assert.equal(cleanDate("2026-02-31"), null, "February 31 must not roll into March");
    assert.equal(cleanDate("April 6"), null);
    assert.equal(cleanDate("06.04.2026"), null);
    assert.equal(cleanDate(null), null);
  });
});

describe("normalizing an extraction", () => {
  it("carries a clean rate con through untouched", () => {
    const fields = normalizeExtraction(extraction());
    assert.deepEqual(fields, {
      broker: "Coyote Logistics",
      loadNumber: "18827411",
      date: "2026-04-06",
      deliveryDate: "2026-04-08",
      originCity: "Laredo",
      originState: "TX",
      destinationCity: "Austell",
      destinationState: "GA",
      loadedMiles: 1404,
      grossRate: 4000,
      equipmentType: "DRY_VAN",
      equipmentLengthFt: 53,
      weightLbs: 42000,
      commodity: "Auto parts",
    });
    assert.deepEqual(missingRequiredFields(fields), []);
  });

  it("reads money and miles that came back as printed text", () => {
    const fields = normalizeExtraction(
      extraction({ grossRate: "$4,200.00", loadedMiles: "1,940 mi" }),
    );
    assert.equal(fields.grossRate, 4200);
    assert.equal(fields.loadedMiles, 1940);
  });

  it("treats a model's stand-ins for absence as absence", () => {
    const fields = normalizeExtraction(
      extraction({ broker: "N/A", commodity: "not stated", loadNumber: "  " }),
    );
    assert.equal(fields.broker, null);
    assert.equal(fields.commodity, null);
    assert.equal(fields.loadNumber, null);
  });

  it("drops values the load form would refuse anyway", () => {
    const fields = normalizeExtraction(
      extraction({ weightLbs: 500_000, equipmentLengthFt: 400, grossRate: -100 }),
    );
    assert.equal(fields.weightLbs, null);
    assert.equal(fields.equipmentLengthFt, null);
    assert.equal(fields.grossRate, null);
  });

  it("normalizes an equipment type written the way a human writes it", () => {
    assert.equal(normalizeExtraction(extraction({ equipmentType: "dry van" })).equipmentType, "DRY_VAN");
    assert.equal(normalizeExtraction(extraction({ equipmentType: "Box-Truck" })).equipmentType, "BOX_TRUCK");
    assert.equal(normalizeExtraction(extraction({ equipmentType: "conestoga" })).equipmentType, null);
  });

  it("drops a delivery date that lands before the pickup", () => {
    const fields = normalizeExtraction(
      extraction({ pickupDate: "2026-04-08", deliveryDate: "2026-04-06" }),
    );
    assert.equal(fields.date, "2026-04-08");
    assert.equal(fields.deliveryDate, null, "the form refuses this pair, so the weaker date goes");
  });

  it("names every required field the document did not provide", () => {
    const fields = normalizeExtraction(
      extraction({ loadedMiles: null, grossRate: null, originState: "XX" }),
    );
    assert.deepEqual(missingRequiredFields(fields).sort(), ["grossRate", "loadedMiles", "originState"]);
  });

  it("survives a reply with the wrong types throughout", () => {
    const parsed = rateConExtractionSchema.parse({
      broker: { name: "Coyote" },
      loadedMiles: [1404],
      grossRate: true,
    });
    const fields = normalizeExtraction(parsed);
    assert.ok(isEmptyExtraction(fields), "nothing usable came back, so nothing is offered");
  });
});
