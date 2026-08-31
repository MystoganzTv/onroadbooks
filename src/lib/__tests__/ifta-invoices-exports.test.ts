import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateIftaReport, iftaRateKey, IFTA_JURISDICTIONS } from "../ifta";
import { nextInvoiceNumber } from "../invoices";
import { freightMarket } from "../markets";
import { buildSeedDataset } from "../seed/seed-data";
import { toPdf } from "../export-pdf";
import { toXlsx } from "../export-xlsx";

describe("IFTA reporting", () => {
  it("contains exactly the 48 contiguous states and 10 Canadian provinces", () => {
    assert.equal(IFTA_JURISDICTIONS.length, 58);
    assert.equal(IFTA_JURISDICTIONS.includes("NT" as never), false);
  });
  it("uses actual jurisdiction miles and flags missing data", () => {
    const dataset = buildSeedDataset();
    const load = { ...dataset.loads[0], date: "2026-07-10", loadedMiles: 90, deadheadMiles: 10,
      jurisdictionMiles: [{ jurisdiction: "VA", totalMiles: 60, nonTaxableMiles: 0 }, { jurisdiction: "MD", totalMiles: 40, nonTaxableMiles: 0 }] };
    dataset.loads = [load];
    dataset.fuelEntries = [{ ...dataset.fuelEntries[0], date: "2026-07-10", gallons: 20, totalCost: 80, jurisdiction: "VA" }];
    dataset.settings.iftaTaxRates = { [iftaRateKey("2026-Q3", "VA")]: 0.3, [iftaRateKey("2026-Q3", "MD")]: 0.4 };
    const report = calculateIftaReport(dataset, "2026-Q3");
    assert.equal(report.fleetMpg, 5);
    assert.equal(report.complete, true);
    assert.equal(report.jurisdictions.find((row) => row.jurisdiction === "VA")?.taxDue, -2.4);
    assert.equal(report.jurisdictions.find((row) => row.jurisdiction === "MD")?.taxDue, 3.2);
    assert.equal(report.netTaxDue, 0.8);
    dataset.fuelEntries[0].jurisdiction = null;
    assert.equal(calculateIftaReport(dataset, "2026-Q3").complete, false);
  });
});

describe("invoice numbering and freight markets", () => {
  it("increments invoice numbers inside the calendar year", () => {
    const loads = buildSeedDataset().loads;
    loads[0].invoiceNumber = "INV-2026-0012";
    assert.equal(nextInvoiceNumber(loads, "2026-08-31"), "INV-2026-0013");
    assert.equal(nextInvoiceNumber(loads, "2027-01-01"), "INV-2027-0001");
  });
  it("normalizes neighboring cities into freight markets", () => {
    assert.equal(freightMarket("Newark", "NJ").key, freightMarket("New York", "NY").key);
    assert.equal(freightMarket("Joliet", "IL").key, freightMarket("Chicago", "IL").key);
  });
});

describe("native exports", () => {
  const table = { title: "Test report", columns: ["Name", "Amount"], rows: [["=unsafe", 123.45]] };
  it("creates a real XLSX package", async () => {
    const bytes = await toXlsx(table);
    assert.equal(Buffer.from(bytes).subarray(0, 2).toString(), "PK");
  });
  it("creates a real PDF document", async () => {
    const bytes = await toPdf(table);
    assert.equal(Buffer.from(bytes).subarray(0, 4).toString(), "%PDF");
  });
});
