import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { summarizePeriod } from "../calculations";
import { REPORT_IDS } from "../export";
import { buildSeedDataset } from "../seed/seed-data";
import { buildYearEndPacket, yearPeriod } from "../year-end";

const dataset = buildSeedDataset();

function cover(year = 2026) {
  return buildYearEndPacket(dataset, year, "EPS Logistics LLC").tables[0];
}

function value(label: string, year = 2026): string | number | undefined {
  return cover(year).rows.find((row) => row[0] === label)?.[1];
}

describe("the year period", () => {
  it("covers the whole calendar year, leap year included", () => {
    assert.equal(yearPeriod(2026).start, "2026-01-01");
    assert.equal(yearPeriod(2026).end, "2026-12-31");
    assert.equal(yearPeriod(2026).days, 365);
    assert.equal(yearPeriod(2028).days, 366);
  });
});

describe("the year-end packet", () => {
  it("is one workbook: a summary plus every report", () => {
    const packet = buildYearEndPacket(dataset, 2026, "EPS Logistics LLC");
    assert.equal(packet.tables.length, REPORT_IDS.length + 1);
    assert.equal(packet.sheetNames.length, packet.tables.length);
    assert.equal(packet.sheetNames[0], "Summary");
    // Excel truncates past 31 characters and rejects []:*?/\ outright.
    for (const name of packet.sheetNames) {
      assert.ok(name.length <= 31, `sheet name too long: ${name}`);
      assert.doesNotMatch(name, /[[\]:*?/\\]/);
    }
  });

  it("names the file after the business and the year", () => {
    assert.equal(
      buildYearEndPacket(dataset, 2026, "EPS Logistics LLC").fileName,
      "onroad-books-eps-logistics-llc-2026.xlsx",
    );
  });

  it("agrees with summarizePeriod to the cent", () => {
    // The packet must never be a second opinion about the year. If these ever
    // disagree, the accountant is reading numbers the app does not show.
    const summary = summarizePeriod(
      dataset.loads,
      dataset.expenses,
      yearPeriod(2026),
      dataset.settings,
    );
    assert.equal(value("Gross revenue"), Number(summary.grossRevenue.toFixed(2)));
    assert.equal(value("Operating expenses"), Number(summary.operatingExpenses.toFixed(2)));
    assert.equal(value("Net profit"), Number(summary.netProfit.toFixed(2)));
    assert.equal(value("Loads recorded"), summary.loadCount);
    assert.equal(value("Total miles"), Math.round(summary.totalMiles));
  });

  it("splits revenue into collected and still owed", () => {
    const collected = Number(value("Revenue collected"));
    const outstanding = Number(value("Revenue still outstanding"));
    assert.equal(collected + outstanding, Number(value("Gross revenue")));
  });

  it("computes no tax liability, and says so", () => {
    const note = String(cover().rows.find((row) => row[0] === "Note")?.[1] ?? "");
    assert.match(note, /not a tax return/i);
    // ADR-0022: computing anybody's tax liability stays out permanently.
    const labels = cover().rows.map((row) => String(row[0]).toLowerCase());
    assert.equal(labels.some((label) => label.includes("tax owed") || label.includes("tax due")), false);
  });

  it("is empty rather than wrong for a year with no records", () => {
    assert.equal(value("Gross revenue", 1999), 0);
    assert.equal(value("Loads recorded", 1999), 0);
  });
});
