import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateIftaReport, iftaRateKey, IFTA_JURISDICTIONS } from "../ifta";
import { fleetIftaApplicability, iftaApplicability } from "../ifta-eligibility";
import {
  duplicateInvoiceNumber,
  invoiceIssueOutcome,
  invoiceIssuePatch,
  nextInvoiceNumber,
} from "../invoices";
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

describe("IFTA applicability", () => {
  it("requires both cross-jurisdiction operation and a qualifying vehicle", () => {
    assert.equal(
      iftaApplicability({
        axleCount: 2,
        registeredGrossWeightLbs: 26_000,
        operatesInMultipleIftaJurisdictions: true,
      }),
      "LIKELY_NOT_REQUIRED",
    );
    assert.equal(
      iftaApplicability({
        axleCount: 2,
        registeredGrossWeightLbs: 26_001,
        operatesInMultipleIftaJurisdictions: true,
      }),
      "LIKELY_REQUIRED",
    );
    assert.equal(
      iftaApplicability({
        axleCount: 3,
        registeredGrossWeightLbs: 18_000,
        operatesInMultipleIftaJurisdictions: true,
      }),
      "LIKELY_REQUIRED",
    );
    assert.equal(
      iftaApplicability({
        axleCount: 3,
        registeredGrossWeightLbs: 33_000,
        operatesInMultipleIftaJurisdictions: false,
      }),
      "LIKELY_NOT_REQUIRED",
    );
  });

  it("preserves unknown history instead of inventing an IFTA classification", () => {
    assert.equal(
      iftaApplicability({
        axleCount: null,
        registeredGrossWeightLbs: null,
        operatesInMultipleIftaJurisdictions: null,
      }),
      "UNKNOWN",
    );
    assert.equal(
      fleetIftaApplicability([
        {
          axleCount: 2,
          registeredGrossWeightLbs: 20_000,
          operatesInMultipleIftaJurisdictions: false,
        },
        {
          axleCount: null,
          registeredGrossWeightLbs: null,
          operatesInMultipleIftaJurisdictions: null,
        },
      ]),
      "UNKNOWN",
    );
  });
});

describe("issuing an invoice", () => {
  it("does not un-collect a load that was already paid", () => {
    // Quick-pay and factoring both land the money before the paperwork. The
    // bug this replaces flipped such a load back to INVOICED, which moved
    // $2,100 out of "Collected" and into "Outstanding" on a load that was
    // settled.
    const outcome = invoiceIssueOutcome(
      { status: "PAID", invoicePaidDate: "2026-08-20" },
      "2026-08-31",
    );
    assert.deepEqual(outcome, { status: "PAID", invoicePaidDate: "2026-08-20" });
  });

  it("writes one patch for the web form and the phone alike", () => {
    // Both callers go through invoiceIssuePatch. Empty optional fields become
    // null rather than "", because "" is a value a customer field can hold and
    // null is the absence the rest of the app checks for.
    const patch = invoiceIssuePatch(
      { status: "PENDING", invoicePaidDate: null },
      {
        invoiceNumber: "INV-2026-0043",
        invoiceDate: "2026-09-01",
        invoiceDueDate: "2026-10-01",
        billToName: "Werner Logistics",
        billToEmail: "",
      },
    );
    assert.equal(patch.status, "INVOICED");
    assert.equal(patch.invoicePaidDate, null);
    assert.equal(patch.billToEmail, null);
    assert.equal(patch.billToAddress, null);
    assert.equal(patch.invoiceNumber, "INV-2026-0043");
  });

  it("refuses to reuse an invoice number on a different load", () => {
    const loads = [
      { id: "a", invoiceNumber: "INV-2026-0001" },
      { id: "b", invoiceNumber: null },
    ] as unknown as Parameters<typeof duplicateInvoiceNumber>[0];
    assert.equal(duplicateInvoiceNumber(loads, "b", "INV-2026-0001"), true);
    // Re-issuing the SAME load with its own number is not a duplicate.
    assert.equal(duplicateInvoiceNumber(loads, "a", "INV-2026-0001"), false);
    assert.equal(duplicateInvoiceNumber(loads, "b", "INV-2026-0002"), false);
  });

  it("backfills a payment date when the load was paid before it had an invoice", () => {
    const outcome = invoiceIssueOutcome({ status: "PAID", invoicePaidDate: null }, "2026-08-31");
    assert.deepEqual(outcome, { status: "PAID", invoicePaidDate: "2026-08-31" });
  });

  it("moves a pending load to invoiced with no payment date", () => {
    assert.deepEqual(
      invoiceIssueOutcome({ status: "PENDING", invoicePaidDate: null }, "2026-08-31"),
      { status: "INVOICED", invoicePaidDate: null },
    );
  });

  it("clears a stale payment date when re-issuing an unpaid invoice", () => {
    assert.deepEqual(
      invoiceIssueOutcome({ status: "INVOICED", invoicePaidDate: "2026-07-01" }, "2026-08-31"),
      { status: "INVOICED", invoicePaidDate: null },
    );
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
