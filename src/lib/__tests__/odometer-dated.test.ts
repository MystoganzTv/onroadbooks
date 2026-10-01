import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { odometerConcernOnDate } from "@/lib/odometer";

// The owner's real September receipts (truck readings by date).
const readings = [
  { id: "a", date: "2026-09-22", odometer: 270_000 },
  { id: "b", date: "2026-09-22", odometer: 270_500 },
  { id: "c", date: "2026-09-24", odometer: 271_184 },
  { id: "d", date: "2026-09-27", odometer: 271_534 },
  { id: "e", date: "2026-09-27", odometer: 271_921 },
  { id: "f", date: "2026-09-28", odometer: 272_178 },
  { id: "g", date: "2026-09-30", odometer: 273_189 },
];

describe("odometer checked by date, not by the order receipts arrive", () => {
  it("accepts yesterday's receipt with fewer miles, entered after today's", () => {
    assert.equal(odometerConcernOnDate(272_900, "2026-09-29", readings), null);
  });

  it("does not compare two fill-ups on the same day", () => {
    assert.equal(odometerConcernOnDate(271_600, "2026-09-27", readings), null);
  });

  it("flags an earlier day reading more than a later day", () => {
    assert.deepEqual(odometerConcernOnDate(273_500, "2026-09-29", readings), {
      kind: "above", reference: 273_189, referenceDate: "2026-09-30",
    });
  });

  it("flags a later day reading less than an earlier day", () => {
    assert.deepEqual(odometerConcernOnDate(271_000, "2026-09-29", readings), {
      kind: "below", reference: 272_178, referenceDate: "2026-09-28",
    });
  });

  it("an edit is not compared with itself", () => {
    assert.equal(odometerConcernOnDate(273_250, "2026-09-30", readings, { excludeId: "g" }), null);
  });

  it("warns about a jump only past the newest reading", () => {
    assert.equal(odometerConcernOnDate(290_000, "2026-10-01", readings)?.kind, "jump");
    assert.equal(odometerConcernOnDate(271_300, "2026-09-25", readings), null);
  });
});
