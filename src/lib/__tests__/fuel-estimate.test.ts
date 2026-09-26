import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fuelRate, fuelReferenceCheck, recentFuelPrice } from "../fuel-estimate";

const fill = (date: string, gallons: number, pricePerGallon: number, truckId = "t1") => ({
  truckId, date, gallons, pricePerGallon, totalCost: Math.round(gallons * pricePerGallon * 100) / 100,
});

describe("recent fuel price", () => {
  it("uses the latest fill-up of the last 30 days", () => {
    const price = recentFuelPrice([fill("2026-09-01", 40, 6.1), fill("2026-09-20", 48, 6.48), fill("2026-09-21", 30, 5, "other")], "t1", "2026-09-25");
    assert.deepEqual(price, { pricePerGallon: 6.48, source: "LATEST", date: "2026-09-20" });
  });

  it("averages 90 days by the gallon when the last fill-up is older than 30", () => {
    const price = recentFuelPrice([fill("2026-07-10", 50, 6), fill("2026-08-01", 50, 7)], "t1", "2026-09-25");
    assert.equal(price?.source, "AVERAGE");
    assert.equal(price?.pricePerGallon, 6.5);
  });

  it("has no price without purchases in the window", () => {
    assert.equal(recentFuelPrice([fill("2026-01-01", 50, 6)], "t1", "2026-09-25"), null);
    assert.equal(recentFuelPrice([], "t1", "2026-09-25"), null);
  });
});

describe("fuel rate", () => {
  const price = { pricePerGallon: 6.4, source: "LATEST" as const, date: "2026-09-20" };

  it("prefers the owner's MPG with a real price", () => {
    const rate = fuelRate({ referenceMpg: 8.5, price, ledgerPerMile: 0.8474 });
    assert.equal(rate?.source, "MPG");
    assert.equal(Math.round(rate!.perMile * 1000) / 1000, 0.753);
  });

  it("uses the ledger without an MPG, and nothing without either", () => {
    assert.deepEqual(fuelRate({ referenceMpg: null, price, ledgerPerMile: 0.85 }), { perMile: 0.85, source: "LEDGER", mpg: null, price });
    assert.equal(fuelRate({ referenceMpg: 0, price: null, ledgerPerMile: null }), null);
  });
});

describe("measured vs reference", () => {
  const rate = fuelRate({ referenceMpg: 8.5, price: { pricePerGallon: 6.4, source: "LATEST", date: null }, ledgerPerMile: 0.85 });

  it("flags a ledger well above the reference, with the MPG it implies", () => {
    const check = fuelReferenceCheck({ rate, ledgerPerMile: 0.85, ledgerMiles: 3_000 });
    assert.ok(check);
    assert.equal(Math.round(check.impliedMpg * 100) / 100, 7.53);
    assert.ok(check.differencePct > 0.1);
  });

  it("stays quiet on thin history or a close match", () => {
    assert.equal(fuelReferenceCheck({ rate, ledgerPerMile: 0.85, ledgerMiles: 900 }), null);
    assert.equal(fuelReferenceCheck({ rate, ledgerPerMile: 0.77, ledgerMiles: 3_000 }), null);
  });
});
