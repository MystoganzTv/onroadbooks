import {
  categoryTotals,
  expensesInPeriod,
  fuelInPeriod,
  loadsInPeriod,
  summarizeFuel,
  summarizePeriod,
} from "./calculations";
import { buildReport, REPORT_IDS, type ReportTable, type ReportId } from "./export";
import { fleetIftaApplicability } from "./ifta-eligibility";
import { dayCount, pad, resolvePeriod, type Period } from "./periods";
import type { Dataset } from "./types";
import {
  FINANCIAL_MODEL_VERSION,
  financialTreatmentOf,
  isOperatingExpenseCategory,
} from "./finance/terminology";

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
const displayMoney = (value: number) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
}).format(value);

/** Excel refuses these in a sheet name, and truncates past 31 characters. */
function sheetName(label: string): string {
  return label.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31);
}

function coverTable(dataset: Dataset, period: Period, businessName: string): ReportTable {
  const summary = summarizePeriod(
    dataset.loads,
    dataset.expenses,
    period,
    dataset.settings,
    dataset.paymentEvents,
  );
  const fuel = summarizeFuel(fuelInPeriod(dataset.fuelEntries, period), summary.totalMiles);
  const categories = categoryTotals(
    expensesInPeriod(dataset.expenses, period).filter((expense) =>
      isOperatingExpenseCategory(expense.category),
    ),
    dataset.settings,
  );
  const rows: (string | number)[][] = [
    ["Business", businessName],
    ["Year", period.label],
    ["Period covered", `${period.start} to ${period.end}`],
    ["Calculation model", `v${FINANCIAL_MODEL_VERSION}`],
    ["", ""],
    ["Booked Revenue", money(summary.bookedRevenue)],
    ["Collected Revenue", money(summary.collectedRevenue)],
    ["Accounts Receivable", money(summary.accountsReceivable)],
    ["Operating expenses", money(summary.operatingExpenses)],
    ["Operating Profit", money(summary.operatingProfit)],
    ["Interest Expense", money(summary.interestExpense)],
    ["Principal Payment", money(summary.principalPayment)],
    ["Unallocated Debt Service", money(summary.unallocatedDebtService)],
    ["Debt Service", money(summary.debtService)],
    ["Cash After Debt Service", money(summary.cashAfterDebtService)],
    ["", ""],
    ["Loads recorded", summary.loadCount],
    ["Loaded miles", Math.round(summary.loadedMiles)],
    ["Deadhead miles", Math.round(summary.deadheadMiles)],
    ["Total miles", Math.round(summary.totalMiles)],
    ["Actual Cost per Mile", money(summary.costPerMile)],
    ["", ""],
    ["Fuel purchased (gallons)", Number(fuel.totalGallons.toFixed(2))],
    ["Fuel cost", money(fuel.totalCost)],
    ["Fixed expenses", money(summary.fixedExpenses)],
    ["Variable expenses", money(summary.variableExpenses)],
  ];

  for (const category of categories) {
    rows.push([`  ${category.label}`, money(category.amount)]);
  }

  rows.push(["", ""]);
  rows.push([
    "Note",
    "Prepared by OnRoad Books from the owner's own records. This is a summary of what happened, not a tax return, and it computes no tax liability.",
  ]);

  return {
    title: `${businessName} — ${period.label} year-end packet`,
    calculationVersion: FINANCIAL_MODEL_VERSION,
    columns: ["Item", "Value"],
    rows,
  };
}

function monthlyTrendsTable(dataset: Dataset, year: number, businessName: string): ReportTable {
  const rows = Array.from({ length: 12 }, (_, monthIndex) => {
    const month = `${year}-${pad(monthIndex + 1)}`;
    const period = resolvePeriod(month, "full");
    const summary = summarizePeriod(
      dataset.loads,
      dataset.expenses,
      period,
      dataset.settings,
      dataset.paymentEvents,
    );
    const label = new Date(year, monthIndex, 1).toLocaleDateString("en-US", { month: "short" });
    return [
      label,
      money(summary.bookedRevenue),
      money(summary.collectedRevenue),
      money(summary.accountsReceivable),
      money(summary.operatingExpenses),
      money(summary.operatingProfit),
      money(summary.debtService),
      money(summary.cashAfterDebtService),
      Math.round(summary.totalMiles),
      money(summary.profitPerMile),
      summary.loadCount,
    ];
  });

  return {
    title: `${businessName} — ${year} monthly trends`,
    calculationVersion: FINANCIAL_MODEL_VERSION,
    columns: [
      "Month",
      "You Earned",
      "Collected",
      "Still Owed",
      "Business Expenses",
      "Business Made",
      "Debt Payments",
      "Cash After Debt",
      "Miles",
      "Profit / Mile",
      "Loads",
    ],
    rows,
  };
}

type ReviewStatus = "ACTION" | "OK";

interface ReviewCheck {
  status: ReviewStatus;
  what: string;
  records: number;
  amount: number;
  why: string;
  action: string;
  route: string;
}

function reviewChecksTable(dataset: Dataset, period: Period, businessName: string): ReportTable {
  const loads = loadsInPeriod(dataset.loads, period);
  const expenses = expensesInPeriod(dataset.expenses, period);
  const fuel = fuelInPeriod(dataset.fuelEntries, period);
  const summary = summarizePeriod(
    dataset.loads,
    dataset.expenses,
    period,
    dataset.settings,
    dataset.paymentEvents,
  );
  const paymentLoadIds = new Set(dataset.paymentEvents.map((event) => event.loadId));
  const paidWithoutDate = loads.filter(
    (load) => load.status === "PAID" && !load.invoicePaidDate && !paymentLoadIds.has(load.id),
  );
  const paidWithoutDateAmount = paidWithoutDate.reduce((sum, load) => sum + load.grossRate, 0);
  const missingCustomer = loads.filter((load) => !load.billToName?.trim() && !load.broker?.trim());
  const missingInvoice = loads.filter((load) => !load.invoiceNumber?.trim());
  const iftaRelevant = fleetIftaApplicability(dataset.trucks.filter((truck) => truck.active)) === "LIKELY_REQUIRED";
  const missingIftaLoads = iftaRelevant
    ? loads.filter((load) => load.loadedMiles + load.deadheadMiles > 0 && load.jurisdictionMiles.length === 0)
    : [];
  const missingIftaFuel = iftaRelevant ? fuel.filter((entry) => !entry.jurisdiction) : [];
  const missingFuelDetails = fuel.filter((entry) => !entry.location?.trim() || entry.odometer == null);
  const unclassifiedDebt = expenses.filter(
    (expense) => financialTreatmentOf(expense) === "DEBT_UNALLOCATED",
  );
  const unclassifiedDebtAmount = unclassifiedDebt.reduce((sum, expense) => sum + expense.amount, 0);

  const issue = (
    condition: boolean,
    actionCheck: Omit<ReviewCheck, "status">,
    okWhat: string,
  ): ReviewCheck => condition
    ? { status: "ACTION", ...actionCheck }
    : { status: "OK", what: okWhat, records: 0, amount: 0, why: "No exception found for this period.", action: "No action needed.", route: "" };

  const checks: ReviewCheck[] = [
    issue(
      paidWithoutDate.length > 0,
      {
        what: `${displayMoney(paidWithoutDateAmount)} NEEDS A PAYMENT DATE`,
        records: paidWithoutDate.length,
        amount: money(paidWithoutDateAmount),
        why: "These loads are marked paid, but OnRoad cannot place the cash in the month it arrived.",
        action: "Record the date each payment reached the business.",
        route: "/invoices",
      },
      "Payment dates are complete.",
    ),
    issue(
      missingInvoice.length > 0,
      {
        what: `${missingInvoice.length} LOAD${missingInvoice.length === 1 ? "" : "S"} NEED${missingInvoice.length === 1 ? "S" : ""} AN INVOICE`,
        records: missingInvoice.length,
        amount: money(missingInvoice.reduce((sum, load) => sum + load.grossRate, 0)),
        why: "Uninvoiced work can delay collection and makes the receivables trail incomplete.",
        action: "Create the missing invoices or confirm that they are not billable.",
        route: "/invoices",
      },
      "Every load has an invoice.",
    ),
    issue(
      missingCustomer.length > 0,
      {
        what: `${missingCustomer.length} LOAD${missingCustomer.length === 1 ? "" : "S"} NEED${missingCustomer.length === 1 ? "S" : ""} A CUSTOMER OR BROKER`,
        records: missingCustomer.length,
        amount: money(missingCustomer.reduce((sum, load) => sum + load.grossRate, 0)),
        why: "Revenue cannot be traced cleanly to the party responsible for payment.",
        action: "Add the broker or invoice customer to each load.",
        route: "/loads",
      },
      "Customer and broker details are complete.",
    ),
    issue(
      missingIftaLoads.length + missingIftaFuel.length > 0,
      {
        what: `${missingIftaLoads.length + missingIftaFuel.length} IFTA RECORD${missingIftaLoads.length + missingIftaFuel.length === 1 ? "" : "S"} NEED${missingIftaLoads.length + missingIftaFuel.length === 1 ? "S" : ""} DETAIL`,
        records: missingIftaLoads.length + missingIftaFuel.length,
        amount: 0,
        why: "Missing jurisdiction mileage or tax-paid fuel can make the IFTA report incomplete.",
        action: "Assign trip miles and fuel purchases to the correct jurisdictions.",
        route: "/ifta",
      },
      iftaRelevant ? "IFTA mileage and fuel jurisdiction records are complete." : "IFTA detail is not indicated by the current fleet profile.",
    ),
    issue(
      missingFuelDetails.length > 0,
      {
        what: `${missingFuelDetails.length} FUEL ENTR${missingFuelDetails.length === 1 ? "Y NEEDS" : "IES NEED"} DETAILS`,
        records: missingFuelDetails.length,
        amount: money(missingFuelDetails.reduce((sum, entry) => sum + entry.totalCost, 0)),
        why: "Missing location or odometer readings weakens MPG, audit and fuel-tax analysis.",
        action: "Add the location and odometer reading from the fuel receipt.",
        route: "/fuel",
      },
      "Fuel detail is complete.",
    ),
    issue(
      unclassifiedDebt.length > 0,
      {
        what: `${displayMoney(unclassifiedDebtAmount)} OF DEBT PAYMENTS NEEDS CLASSIFICATION`,
        records: unclassifiedDebt.length,
        amount: money(unclassifiedDebtAmount),
        why: "Without an interest/principal split, financing cost and debt reduction cannot be separated.",
        action: "Split each payment into interest and principal.",
        route: "/expenses",
      },
      "Debt payments are classified.",
    ),
  ];

  const operatingDifference = money(
    summary.bookedRevenue - summary.operatingExpenses - summary.operatingProfit,
  );
  const cashDifference = money(
    summary.collectedRevenue - summary.operatingExpenses - summary.debtService - summary.cashAfterDebtService,
  );
  const mileageDifference = money(
    summary.loadedMiles + summary.deadheadMiles - summary.totalMiles,
  );
  const reconciliation = (
    name: string,
    difference: number,
    why: string,
  ): ReviewCheck => ({
    status: Math.abs(difference) < 0.01 ? "OK" : "ACTION",
    what: name,
    records: 0,
    amount: difference,
    why,
    action: Math.abs(difference) < 0.01 ? "Reconciled to the canonical engine." : "Review the source ledger and calculation version.",
    route: Math.abs(difference) < 0.01 ? "" : "/reports",
  });

  checks.push(
    reconciliation("Operating profit reconciles", operatingDifference, "You earned minus business expenses must equal business profit."),
    reconciliation("Cash after debt reconciles", cashDifference, "Collected cash minus business expenses and debt payments must equal cash after debt."),
    reconciliation("Mileage reconciles", mileageDifference, "Loaded miles plus deadhead miles must equal total miles."),
  );

  checks.sort((left, right) => Number(right.status === "ACTION") - Number(left.status === "ACTION"));

  return {
    title: `${businessName} — ${period.label} review & checks`,
    calculationVersion: FINANCIAL_MODEL_VERSION,
    columns: ["Status", "What happened", "Records", "Amount", "Why it matters", "What to do", "Open in OnRoad"],
    rows: checks.map((check) => [
      check.status,
      check.what,
      check.records,
      check.amount,
      check.why,
      check.action,
      check.route,
    ]),
  };
}

export interface YearEndPacket {
  fileName: string;
  /** Executive summary and decision sheets first, then one sheet per report. */
  tables: ReportTable[];
  sheetNames: string[];
}

export function buildYearEndPacket(
  dataset: Dataset,
  year: number,
  businessName: string,
): YearEndPacket {
  const period = yearPeriod(year);
  const tables = [
    coverTable(dataset, period, businessName),
    monthlyTrendsTable(dataset, year, businessName),
    reviewChecksTable(dataset, period, businessName),
  ];
  const sheetNames = ["Summary", "Monthly Trends", "Review & Checks"];

  for (const id of REPORT_IDS as ReportId[]) {
    // This is the recommended accountant handoff. Owner reserve planning and
    // Safe to Pay Yourself are intentionally excluded from every sheet.
    tables.push(buildReport(id, dataset, period, null, false));
    sheetNames.push(sheetName(id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())));
  }

  const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    fileName: `onroad-books-${slug || "year-end"}-${year}.xlsx`,
    tables,
    sheetNames,
  };
}
