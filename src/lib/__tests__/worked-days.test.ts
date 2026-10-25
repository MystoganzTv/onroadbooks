import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_TRIP_DAYS, tripDays, workedDays } from "@/lib/worked-days";

const october = { start: "2026-10-01", end: "2026-10-31" };

describe("worked days", () => {
  it("counts every day from pickup through delivery", () => {
    assert.deepEqual(tripDays({ date: "2026-10-03", deliveryDate: "2026-10-05" }), [
      "2026-10-03", "2026-10-04", "2026-10-05",
    ]);
  });

  it("counts only the pickup day when there is no delivery date, or it is before pickup", () => {
    assert.deepEqual(tripDays({ date: "2026-10-03", deliveryDate: null }), ["2026-10-03"]);
    assert.deepEqual(tripDays({ date: "2026-10-03", deliveryDate: "2026-10-01" }), ["2026-10-03"]);
  });

  it("does not let a mistyped delivery year paint weeks as worked", () => {
    const days = tripDays({ date: "2026-10-03", deliveryDate: "2027-10-05" });
    assert.deepEqual(days, ["2026-10-03"]);
    assert.ok(MAX_TRIP_DAYS < 30);
  });

  it("splits elapsed days into worked and off, and leaves the rest of the month alone", () => {
    const report = workedDays(
      [
        { date: "2026-09-20", deliveryDate: null }, // the business was already running
        { date: "2026-10-02", deliveryDate: "2026-10-03" },
        { date: "2026-10-03", deliveryDate: "2026-10-04" }, // overlaps: still one day each
        { date: "2026-10-28", deliveryDate: "2026-10-29" }, // booked ahead
      ],
      october,
      "2026-10-10",
    );
    assert.equal(report.worked, 3); // 2, 3, 4
    assert.equal(report.off, 6); // 1, 5, 6, 7, 8, 9
    assert.equal(report.booked, 2); // 28, 29
    assert.equal(report.upcoming, 31 - 3 - 6 - 2); // today (10th) onward, unbooked
    assert.equal(report.days.find((d) => d.date === "2026-10-03")?.loadCount, 2);
    assert.equal(report.days.find((d) => d.date === "2026-10-10")?.state, "upcoming");
    assert.equal(report.workedShare, 3 / 9);
    assert.equal(report.longestOffStreak, 5); // 5th through 9th
  });

  it("counts a load on today as worked", () => {
    const report = workedDays([{ date: "2026-10-10", deliveryDate: null }], october, "2026-10-10");
    assert.equal(report.days.find((d) => d.date === "2026-10-10")?.state, "worked");
  });

  it("clips a trip that crosses the edge of the range", () => {
    const report = workedDays(
      [{ date: "2026-09-29", deliveryDate: "2026-10-02" }],
      october,
      "2026-10-31",
    );
    assert.equal(report.worked, 2);
    assert.equal(report.days.length, 31);
  });

  it("buckets a long range by month, starting at the first load ever", () => {
    const report = workedDays(
      [{ date: "2026-08-10", deliveryDate: "2026-08-11" }, { date: "2026-09-01", deliveryDate: null }],
      { start: "2026-01-01", end: "2026-09-30" },
      "2026-10-01",
    );
    // January through July were before the business ran: not "off".
    assert.deepEqual(report.months.map((m) => [m.month, m.worked, m.off]), [
      ["2026-08", 2, 20],
      ["2026-09", 1, 29],
    ]);
    assert.equal(report.days.find((d) => d.date === "2026-08-09")?.state, "before");
    assert.equal(report.off, 49);
  });

  it("uses loads outside the period to know the business was already running", () => {
    const report = workedDays([{ date: "2026-09-15", deliveryDate: null }], october, "2026-11-01");
    assert.equal(report.off, 31);
    assert.equal(report.longestOffStreak, 31);
  });

  it("calls nothing off when no load has ever been recorded", () => {
    const report = workedDays([], october, "2026-11-01");
    assert.equal(report.off, 0);
    assert.equal(report.workedShare, null);
  });

  it("has no share before a single day has elapsed", () => {
    assert.equal(workedDays([{ date: "2026-09-01", deliveryDate: null }], october, "2026-10-01").workedShare, null);
  });
});
