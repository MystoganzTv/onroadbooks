import {
  categoryTotals,
  expensesInPeriod,
  fuelInPeriod,
  summarizeFuel,
  summarizePeriod,
} from "./calculations";
import { buildReport, REPORT_IDS, type ReportTable, type ReportId } from "./export";
import { calculateReserveBalances } from "./finance/reserves";
import { dayCount, type Period } from "./periods";
import type { Dataset } from "./types";

/**
 * The packet for the accountant.
 *
 * ADR-0022 drew the line and it holds here: this hands over what happened, in
 * one file, and computes nobody's tax liability. That varies by state and by
 * entity, and it is advice. Your accountant files; we hand them the file.
 *
 * One workbook rather than a folder of exports, because "send this to my
 * accountant" should be one attachment, and because the six reports already
 * exist as tables — a packet is a new arrangement of them, not new maths.
 */

export function yearPeriod(year: number): Period {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  return {
    key: "custom",
    month: `${year}-01`,
    start,
    end,
    label: String(year),
    shortLabel: String(year),
    days: dayCount({ start, end }),
  };
}

const money = (value: number) => Number(value.toFixed(2));

/** Excel refuses these in a sheet name, and truncates past 31 characters. */
function sheetName(label: string): string {
  return label.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31);
}

function coverTable(dataset: Dataset, period: Period, businessName: string): ReportTable {
  const summary = summarizePeriod(dataset.loads, dataset.expenses, period, dataset.settings);
  const fuel = summarizeFuel(fuelInPeriod(dataset.fuelEntries, period), summary.totalMiles);
  const categories = categoryTotals(expensesInPeriod(dataset.expenses, period), dataset.settings);
  const reserves = calculateReserveBalances(
    dataset.reserveAccounts,
    dataset.reserveTransactions,
    period,
  );

  const rows: (string | number)[][] = [
    ["Business", businessName],
    ["Year", period.label],
    ["Period covered", `${period.start} to ${period.end}`],
    ["", ""],
    ["Gross revenue", money(summary.grossRevenue)],
    ["Operating expenses", money(summary.operatingExpenses)],
    ["Net profit", money(summary.netProfit)],
    ["", ""],
    ["Loads recorded", summary.loadCount],
    ["Loaded miles", Math.round(summary.loadedMiles)],
    ["Deadhead miles", Math.round(summary.deadheadMiles)],
    ["Total miles", Math.round(summary.totalMiles)],
    ["Cost per mile", money(summary.costPerMile)],
    ["", ""],
    ["Fuel purchased (gallons)", Number(fuel.totalGallons.toFixed(2))],
    ["Fuel cost", money(fuel.totalCost)],
    ["Revenue collected", money(summary.paidRevenue)],
    ["Revenue still outstanding", money(summary.outstandingRevenue)],
    ["", ""],
    ["Fixed expenses", money(summary.fixedExpenses)],
    ["Variable expenses", money(summary.variableExpenses)],
  ];

  for (const category of categories) {
    rows.push([`  ${category.label}`, money(category.amount)]);
  }

  if (reserves.length > 0) {
    rows.push(["", ""]);
    for (const reserve of reserves) {
      rows.push([`Reserve balance — ${reserve.account.name}`, money(reserve.balance)]);
    }
  }

  rows.push(["", ""]);
  rows.push([
    "Note",
    "Prepared by OnRoad Books from the owner's own records. This is a summary of what happened, not a tax return, and it computes no tax liability.",
  ]);

  return {
    title: `${businessName} — ${period.label} year-end packet`,
    columns: ["Item", "Value"],
    rows,
  };
}

export interface YearEndPacket {
  fileName: string;
  /** Cover first, then one sheet per report. */
  tables: ReportTable[];
  sheetNames: string[];
}

export function buildYearEndPacket(
  dataset: Dataset,
  year: number,
  businessName: string,
): YearEndPacket {
  const period = yearPeriod(year);
  const tables = [coverTable(dataset, period, businessName)];
  const sheetNames = ["Summary"];

  for (const id of REPORT_IDS as ReportId[]) {
    tables.push(buildReport(id, dataset, period));
    sheetNames.push(sheetName(id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())));
  }

  const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    fileName: `onroad-books-${slug || "year-end"}-${year}.xlsx`,
    tables,
    sheetNames,
  };
}
