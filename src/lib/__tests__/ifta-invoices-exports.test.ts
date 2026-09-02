import assert from "node:assert/strict";
import { describe, it } from "node:test";
import ExcelJS from "exceljs";

import { calculateIftaReport, iftaPendingScopeTruckIds, iftaRateKey, IFTA_JURISDICTIONS } from "../ifta";
import {
  fleetIftaApplicability,
  iftaApplicability,
  iftaReportingLabel,
  iftaReportingTruckIds,
} from "../ifta-eligibility";
import {
  duplicateInvoiceNumber,
  invoiceIssueOutcome,
  invoiceIssuePatch,
  nextInvoiceNumber,
} from "../invoices";
import { freightMarket } from "../markets";
import { buildSeedDataset } from "../seed/seed-data";
import { toPdf } from "../export-pdf";
import { toXlsx, toXlsxWorkbook } from "../export-xlsx";
import { buildYearEndPacket } from "../year-end";

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

  it("keeps excluded trucks out of a fleet filing", () => {
    const dataset = buildSeedDataset();
    const includedTruck = { ...dataset.trucks[0], iftaReportingEnabled: true };
    const excludedTruck = {
      ...dataset.trucks[0],
      id: "truck-excluded",
      name: "Local unit",
      iftaReportingEnabled: false,
    };
    dataset.trucks = [includedTruck, excludedTruck];
    const load = {
      ...dataset.loads[0],
      truckId: includedTruck.id,
      date: "2026-07-10",
      loadedMiles: 90,
      deadheadMiles: 10,
      jurisdictionMiles: [{ jurisdiction: "VA", totalMiles: 100, nonTaxableMiles: 0 }],
    };
    dataset.loads = [load, { ...load, id: "excluded-load", truckId: excludedTruck.id }];
    const fuel = {
      ...dataset.fuelEntries[0],
      truckId: includedTruck.id,
      date: "2026-07-10",
      gallons: 20,
      totalCost: 80,
      jurisdiction: "VA",
    };
    dataset.fuelEntries = [fuel, { ...fuel, id: "excluded-fuel", truckId: excludedTruck.id }];
    dataset.settings.iftaTaxRates = { [iftaRateKey("2026-Q3", "VA")]: 0.3 };

    const includedIds = iftaReportingTruckIds(dataset.trucks);
    const report = calculateIftaReport(dataset, "2026-Q3", null, includedIds);

    assert.deepEqual(includedIds, [includedTruck.id]);
    assert.equal(report.totalFleetMiles, 100);
    assert.equal(report.totalGallons, 20);
    assert.equal(report.complete, true);
    assert.equal(iftaReportingLabel(null), "Decision needed");
    assert.equal(iftaReportingLabel(false), "Excluded");
  });

  it("counts an archived truck that ran this quarter as a pending decision", () => {
    // A unit sold mid-quarter still drove the miles it drove. Counting
    // pendings over ACTIVE trucks only dropped 12,000 of 13,000 miles and a
    // whole jurisdiction out of the draft while it still said "Ready to file".
    const dataset = buildSeedDataset();
    const running = { ...dataset.trucks[0], id: "truck-running", iftaReportingEnabled: true };
    const sold = {
      ...dataset.trucks[0],
      id: "truck-sold",
      name: "Sold mid-quarter",
      active: false,
      iftaReportingEnabled: null,
    };
    dataset.trucks = [running, sold];
    const load = {
      ...dataset.loads[0],
      truckId: running.id,
      date: "2026-07-10",
      loadedMiles: 1_000,
      deadheadMiles: 0,
      jurisdictionMiles: [{ jurisdiction: "TX", totalMiles: 1_000, nonTaxableMiles: 0 }],
    };
    dataset.loads = [
      load,
      {
        ...load,
        id: "sold-load",
        truckId: sold.id,
        loadedMiles: 12_000,
        jurisdictionMiles: [{ jurisdiction: "NM", totalMiles: 12_000, nonTaxableMiles: 0 }],
      },
    ];
    dataset.fuelEntries = [];

    const pending = iftaPendingScopeTruckIds(dataset, "2026-Q3");
    assert.deepEqual(pending, [sold.id], "an archived truck with miles is still undecided");

    // And a truck that did not run in the window is nobody's decision to make.
    dataset.loads = [load];
    assert.deepEqual(iftaPendingScopeTruckIds(dataset, "2026-Q3"), []);
    assert.deepEqual(iftaPendingScopeTruckIds(dataset, "2026-Q1"), []);
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

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.buffer as ArrayBuffer);
    const sheet = workbook.getWorksheet("Report")!;
    assert.equal(sheet.getCell("A4").value, "RECORDS");
    assert.equal(sheet.getCell("A10").value, "Name");
    assert.equal(sheet.getCell("A11").value, "'=unsafe");
    assert.equal(sheet.views[0]?.showGridLines, false);
    assert.equal((sheet.views[0] as ExcelJS.WorksheetViewFrozen | undefined)?.ySplit, 10);
  });
  it("turns the year-end packet into an executive workbook", async () => {
    const packet = buildYearEndPacket(buildSeedDataset(), 2026, "EPS Logistics LLC");
    const bytes = await toXlsxWorkbook(packet.tables, packet.sheetNames);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.buffer as ArrayBuffer);

    assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), packet.sheetNames);
    const summary = workbook.getWorksheet("Summary")!;
    assert.match(String(summary.getCell("A1").value), /EPS Logistics LLC.*2026 YEAR-END REPORT/);
    assert.equal(summary.getCell("A5").value, "YOU EARNED");
    assert.equal(summary.getCell("D5").value, "YOUR BUSINESS MADE");
    assert.equal(summary.getCell("G5").value, "YOU COLLECTED");
    assert.equal(summary.getCell("J5").value, "STILL OWED");
    assert.equal(summary.getCell("A6").value, 37_570);
    assert.equal(summary.getCell("A6").numFmt, '$#,##0.00;[Red]($#,##0.00);-');
    assert.equal(summary.getCell("A10").value, "YOUR YEAR BY MONTH");
    assert.equal(summary.getCell("A11").value, "Month");
    assert.equal(summary.getCell("A12").value, "You earned");
    assert.equal(summary.views[0]?.showGridLines, false);
    assert.match(String(summary.pageSetup.printArea), /^A1:M/);

    const monthly = workbook.getWorksheet("Monthly Trends")!;
    assert.equal(monthly.getCell("A10").value, "Month");
    assert.equal(monthly.getCell("A11").value, "Jan");
    assert.equal(monthly.getCell("A22").value, "Dec");

    const review = workbook.getWorksheet("Review & Checks")!;
    assert.equal(review.getCell("A10").value, "Status");
    assert.equal(review.getCell("B10").value, "What happened");
    assert.equal(review.getCell("F10").value, "What to do");
    assert.equal(review.getCell("C11").numFmt, '#,##0;[Red](#,##0);-');

    const loads = workbook.getWorksheet("Loads")!;
    assert.equal(loads.getCell("A4").value, "LOADS MOVED");
    assert.equal(loads.getCell("D4").value, "HOW MUCH YOU EARNED");
    assert.equal(loads.getCell("A9").value, "LOAD & ROUTE");
    assert.equal(loads.getCell("A10").value, "Truck");
    assert.equal(loads.getCell("N9").value, "MILEAGE");
    assert.ok(loads.autoFilter);
    if (typeof loads.autoFilter === "string") {
      assert.equal(loads.autoFilter, "A10:AG10");
    } else {
      assert.deepEqual(loads.autoFilter.from, { row: 10, column: 1 });
    }
    assert.equal((loads.views[0] as ExcelJS.WorksheetViewFrozen | undefined)?.ySplit, 10);
    assert.equal(loads.pageSetup.fitToWidth, 3);

    const loadHeaders = loads.getRow(10).values as ExcelJS.CellValue[];
    const deadheadMilesColumn = loadHeaders.findIndex((value) => value === "Deadhead Miles");
    const deadheadPercentColumn = loadHeaders.findIndex((value) => value === "Deadhead %");
    assert.equal(loads.getCell(11, deadheadMilesColumn).numFmt, '#,##0;[Red](#,##0);-');
    assert.equal(loads.getCell(11, deadheadPercentColumn).numFmt, '0.0"%";[Red](0.0"%");-');

    const profitLoss = workbook.getWorksheet("Profit Loss")!;
    const profitLossHeaders = profitLoss.getRow(10).values as ExcelJS.CellValue[];
    const perMileColumn = profitLossHeaders.findIndex((value) => value === "Per Total Mile");
    assert.equal(profitLoss.getCell(15, perMileColumn).numFmt, '$0.00;[Red]($0.00);-');
    assert.notEqual((profitLoss.getCell("E10").fill as ExcelJS.FillPattern | undefined)?.pattern, "solid");

    const expenses = workbook.getWorksheet("Expenses")!;
    assert.ok(
      Array.from({ length: Math.max(0, expenses.rowCount - 10) }, (_, index) => expenses.getRow(index + 11).height ?? 0)
        .some((height) => height > 21),
      "wrapped expense notes should receive enough row height",
    );

    for (const sheetName of packet.sheetNames.slice(1)) {
      const detail = workbook.getWorksheet(sheetName)!;
      assert.ok(detail.getCell("A4").value, `${sheetName} should have a report summary`);
      assert.ok(detail.getCell("A10").value, `${sheetName} should have a visible table header`);
      assert.equal(detail.views[0]?.showGridLines, false);
    }
  });

  it("presents a negative cash position as a positive, explained funding gap", async () => {
    const table = {
      title: "Financial Summary — Whole fleet — 2026",
      columns: ["Line", "Amount", "Per Total Mile", "Notes"],
      rows: [
        ["Booked Revenue", 5_200, 3.64, "3 loads"],
        ["Total operating expenses", 2_381.69, 1.67, "Operating costs"],
        ["Operating Profit", 2_818.31, 1.97, "54.2% margin"],
        ["Cash After Debt Service", -2_695.69, -1.89, "Collected cash less outflows"],
      ],
    };
    const bytes = await toXlsxWorkbook([table], ["Profit Loss"]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.buffer as ArrayBuffer);
    const sheet = workbook.getWorksheet("Profit Loss")!;
    assert.equal(sheet.getCell("G4").value, "CASH GAP AFTER DEBT");
    assert.equal(sheet.getCell("G5").value, 2_695.69);
    assert.equal(sheet.getCell("G7").value, "Cash out + debt exceeded collections");
  });
  it("creates a real PDF document", async () => {
    const bytes = await toPdf(table);
    assert.equal(Buffer.from(bytes).subarray(0, 4).toString(), "%PDF");
  });
});
