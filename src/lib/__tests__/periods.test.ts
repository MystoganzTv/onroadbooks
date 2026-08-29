import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addDays,
  dayCount,
  defaultEntryDate,
  eachDay,
  isISODate,
  previousPeriod,
  resolvePeriod,
  weekRange,
} from "../periods";

const TODAY = "2026-08-29";

describe("resolvePeriod", () => {
  it("resolves every period key to an inclusive range", () => {
    const cases: [Parameters<typeof resolvePeriod>[1], string, string][] = [
      ["today", TODAY, TODAY],
      ["first", "2026-08-01", "2026-08-15"],
      ["second", "2026-08-16", "2026-08-31"],
      ["full", "2026-08-01", "2026-08-31"],
      ["quarter", "2026-07-01", "2026-09-30"],
      ["ytd", "2026-01-01", "2026-08-31"],
    ];
    for (const [key, start, end] of cases) {
      const p = resolvePeriod("2026-08", key, { today: TODAY });
      assert.equal(p.start, start, `${key} start`);
      assert.equal(p.end, end, `${key} end`);
    }
  });

  it("handles month lengths and leap years", () => {
    assert.equal(resolvePeriod("2026-02", "second").end, "2026-02-28");
    assert.equal(resolvePeriod("2028-02", "second").end, "2028-02-29");
    assert.equal(resolvePeriod("2026-04", "second").end, "2026-04-30");
    assert.equal(dayCount(resolvePeriod("2028-02", "full")), 29);
  });

  it("anchors a week to the month it starts in", () => {
    const p = resolvePeriod("2026-08", "week", { today: "2026-08-31" });
    assert.equal(p.start, "2026-08-31");
    assert.equal(p.end, "2026-09-06");
    assert.equal(p.month, "2026-08");
  });

  it("swaps a reversed custom range", () => {
    const p = resolvePeriod("2026-08", "custom", { from: "2026-08-19", to: "2026-08-04" });
    assert.equal(p.start, "2026-08-04");
    assert.equal(p.end, "2026-08-19");
    assert.equal(p.days, 16);
  });

  it("rejects a well-formed but impossible custom date", () => {
    const p = resolvePeriod("2026-02", "custom", { from: "2026-02-01", to: "2026-02-30" });
    assert.equal(p.end, "2026-02-28");
    assert.ok(!p.label.includes("Mar"));
  });

  it("falls back to the full month on nonsense input", () => {
    const p = resolvePeriod("2026-08", "custom", { from: "not-a-date", to: "2026-99-99" });
    assert.equal(p.start, "2026-08-01");
    assert.equal(p.end, "2026-08-31");
  });

  it("prefers the caller's date for Today, so the server timezone cannot shift it", () => {
    const p = resolvePeriod("2026-08", "today", { from: "2026-08-30", to: "2026-08-30" });
    assert.equal(p.start, "2026-08-30");
  });
});

describe("isISODate", () => {
  it("accepts real dates only", () => {
    assert.equal(isISODate("2026-02-28"), true);
    assert.equal(isISODate("2028-02-29"), true);
    assert.equal(isISODate("2026-02-29"), false);
    assert.equal(isISODate("2026-02-30"), false);
    assert.equal(isISODate("2026-13-01"), false);
    assert.equal(isISODate("2026-00-10"), false);
    assert.equal(isISODate("26-01-01"), false);
    assert.equal(isISODate(undefined), false);
  });
});

describe("previousPeriod", () => {
  it("gives each period a comparable predecessor", () => {
    assert.equal(previousPeriod(resolvePeriod("2026-08", "second")).start, "2026-08-01");
    assert.equal(previousPeriod(resolvePeriod("2026-08", "first")).start, "2026-07-16");
    assert.equal(previousPeriod(resolvePeriod("2026-08", "full")).start, "2026-07-01");
  });

  it("crosses the year boundary correctly", () => {
    assert.equal(previousPeriod(resolvePeriod("2026-01", "full")).start, "2025-12-01");
    assert.equal(previousPeriod(resolvePeriod("2026-01", "first")).start, "2025-12-16");
    assert.equal(previousPeriod(resolvePeriod("2026-02", "quarter")).start, "2025-10-01");
    assert.equal(previousPeriod(resolvePeriod("2026-08", "ytd")).start, "2025-01-01");
  });

  it("matches window length for floating and custom ranges", () => {
    const custom = resolvePeriod("2026-08", "custom", { from: "2026-08-10", to: "2026-08-19" });
    const prev = previousPeriod(custom);
    assert.equal(prev.days, custom.days);
    assert.equal(prev.end, "2026-08-09");
  });
});

describe("day helpers", () => {
  it("counts inclusive days", () => {
    assert.equal(dayCount({ start: "2026-08-01", end: "2026-08-01" }), 1);
    assert.equal(dayCount({ start: "2026-08-01", end: "2026-08-31" }), 31);
  });

  it("enumerates both endpoints", () => {
    const days = eachDay({ start: "2026-08-30", end: "2026-09-02" });
    assert.deepEqual(days, ["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02"]);
  });

  it("weeks run Monday to Sunday", () => {
    const w = weekRange("2026-08-29"); // a Saturday
    assert.equal(w.start, "2026-08-24");
    assert.equal(w.end, "2026-08-30");
  });

  it("addDays crosses months and years", () => {
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2028-03-01", -1), "2028-02-29");
  });
});

describe("defaultEntryDate", () => {
  it("uses today when today is inside the period", () => {
    assert.equal(defaultEntryDate(resolvePeriod("2026-08", "full"), TODAY), TODAY);
  });
  it("uses the period start otherwise", () => {
    assert.equal(defaultEntryDate(resolvePeriod("2026-03", "full"), TODAY), "2026-03-01");
    assert.equal(defaultEntryDate(resolvePeriod("2026-08", "ytd"), "2027-01-05"), "2026-01-01");
  });
});
