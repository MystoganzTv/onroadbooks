/**
 * Accountant exports.
 *
 * Each report is defined once as columns + rows, so a new output format
 * (PDF, XLSX) is a new renderer rather than five new report implementations.
 * CSV is implemented; the Reports page also offers a print-to-PDF view.
 */

import {
  behaviorTotals,
  brokerPerformance,
  categoryTotals,
  expensesInPeriod,
  fuelInPeriod,
  loadsInPeriod,
  summarizeFuel,
  summarizePeriod,
  thresholdsFromSettings,
  withMetricsAll,
} from "./calculations";
import { calculateTrueCostPerMile } from "./finance/cost-per-mile";
import { calculateDeadheadCost } from "./finance/deadhead";
import { calculateSafeOwnerPay, resolveReserveRules } from "./finance/owner-pay";
import { behaviorOf, categoryLabel } from "./categories";
import { maintenanceLabel } from "./maintenance";
import type { Period } from "./periods";
import type { Dataset } from "./types";
import { primaryTruck } from "./fleet";

export type ReportId =
  | "loads"
  | "expenses"
  | "fuel"
  | "profit-loss"
  | "mileage"
  | "maintenance";

export interface ReportDefinition {
  id: ReportId;
  label: string;
  description: string;
}

export const REPORTS: ReportDefinition[] = [
  { id: "loads", label: "Loads Report", description: "Every load with its full profitability stack" },
  { id: "expenses", label: "Expense Report", description: "Ledger detail with fixed / variable split" },
  { id: "fuel", label: "Fuel Report", description: "Fill-ups, gallons, price and odometer" },
  { id: "profit-loss", label: "Profit & Loss Summary", description: "Revenue, costs by category, reserves" },
  { id: "mileage", label: "Mileage Report", description: "Loaded, deadhead and total miles by load" },
  { id: "maintenance", label: "Maintenance Report", description: "Service history and next service due" },
];

export const REPORT_IDS = REPORTS.map((r) => r.id);

export interface ReportTable {
  title: string;
  columns: string[];
  rows: (string | number)[][];
}

const money = (value: number | null | undefined) =>
  Number((Number.isFinite(value) ? (value as number) : 0).toFixed(2));
const rate = (value: number | null | undefined) =>
  Number((Number.isFinite(value) ? (value as number) : 0).toFixed(3));

export function buildReport(id: ReportId, dataset: Dataset, period: Period): ReportTable {
  const { loads, expenses, fuelEntries, settings } = dataset;
  const thresholds = thresholdsFromSettings(settings);
  const periodLoads = withMetricsAll(loadsInPeriod(loads, period), thresholds);
  const periodExpenses = expensesInPeriod(expenses, period);
  const periodFuel = fuelInPeriod(fuelEntries, period);
  const summary = summarizePeriod(loads, expenses, period, settings);

  switch (id) {
    case "loads":
      return {
        title: `Loads - ${period.label}`,
        columns: [
          "Date", "Load Number", "Broker", "Origin", "Destination",
          "Loaded Miles", "Deadhead Miles", "Total Miles", "Deadhead %",
          "Gross Rate", "Rate/Loaded Mile", "Rate/Total Mile",
          "Fuel", "Tolls", "Dispatch", "Factoring", "Other",
          "Total Load Expenses", "Load Profit", "Profit/Total Mile",
          "Profit Margin %", "Rating", "Payment Status", "Notes",
        ],
        rows: periodLoads.map((load) => [
          load.date,
          load.loadNumber ?? "",
          load.broker ?? "",
          `${load.originCity}, ${load.originState}`,
          `${load.destinationCity}, ${load.destinationState}`,
          load.loadedMiles,
          load.deadheadMiles,
          load.metrics.totalMiles,
          Number(load.metrics.deadheadPct.toFixed(1)),
          money(load.grossRate),
          rate(load.metrics.revenuePerLoadedMile),
          rate(load.metrics.revenuePerTotalMile),
          money(load.fuelCost),
          money(load.tolls),
          money(load.dispatchFee),
          money(load.factoringFee),
          money(load.otherExpenses),
          money(load.metrics.tripExpenses),
          money(load.metrics.tripProfit),
          rate(load.metrics.profitPerMile),
          Number(load.metrics.profitMargin.toFixed(1)),
          load.metrics.rating,
          load.status,
          load.notes ?? "",
        ]),
      };

    case "expenses":
      return {
        title: `Expenses - ${period.label}`,
        columns: [
          "Date", "Category", "Fixed/Variable", "Description", "Vendor",
          "Amount", "Receipt Number", "Recurring", "Linked Load", "Notes",
        ],
        rows: periodExpenses.map((expense) => {
          const load = expense.loadId ? loads.find((l) => l.id === expense.loadId) : undefined;
          return [
            expense.date,
            categoryLabel(expense.category),
            behaviorOf(expense.category, settings.categoryBehavior) === "FIXED" ? "Fixed" : "Variable",
            expense.description,
            expense.vendor ?? "",
            money(expense.amount),
            expense.receiptNumber ?? "",
            expense.recurring ? "Yes" : "No",
            load ? `${load.date} ${load.originCity}-${load.destinationCity}` : "",
            expense.notes ?? "",
          ];
        }),
      };

    case "fuel": {
      const fuel = summarizeFuel(periodFuel, summary.totalMiles);
      return {
        title: `Fuel - ${period.label}`,
        columns: ["Date", "Location", "Gallons", "Price/Gallon", "Total Cost", "Odometer", "Linked Load"],
        rows: [
          ...periodFuel.map((entry) => {
            const load = entry.loadId ? loads.find((l) => l.id === entry.loadId) : undefined;
            return [
              entry.date,
              entry.location ?? "",
              Number(entry.gallons.toFixed(2)),
              rate(entry.pricePerGallon),
              money(entry.totalCost),
              entry.odometer ?? "",
              load ? `${load.originCity}-${load.destinationCity}` : "",
            ];
          }),
          [],
          ["TOTALS", "", Number(fuel.totalGallons.toFixed(2)), rate(fuel.averagePricePerGallon), money(fuel.totalCost), "", ""],
          // Derived figures are labelled in place so no dollar value ever
          // lands under a gallons or odometer column.
          [`Fuel cost per mile: ${rate(fuel.fuelCostPerMile)}`, "", "", "", "", "", ""],
          [
            `Miles per gallon: ${fuel.milesPerGallon ? Number(fuel.milesPerGallon.toFixed(2)) : "n/a"}`,
            "", "", "", "", "", "",
          ],
        ],
      };
    }

    case "profit-loss": {
      // Same reserve engine as the dashboard and settlements: every active
      // bucket at its configured rate and basis. The legacy two-bucket
      // breakdown ignored custom buckets, so this export disagreed with the
      // app's Safe to Pay whenever one existed.
      const pay = calculateSafeOwnerPay(
        summary,
        resolveReserveRules(settings, dataset.reserveAccounts),
      );
      const behavior = behaviorTotals(periodExpenses, settings);
      const categories = categoryTotals(periodExpenses, settings);

      return {
        title: `Profit & Loss - ${period.label}`,
        columns: ["Line", "Amount", "Per Total Mile", "Notes"],
        rows: [
          ["Period", period.label, "", `${period.start} to ${period.end}`],
          [],
          ["REVENUE", "", "", ""],
          ["Gross revenue", money(summary.grossRevenue), rate(summary.revenuePerMile), `${summary.loadCount} loads`],
          ["Collected", money(summary.paidRevenue), "", "Paid loads"],
          ["Outstanding", money(summary.outstandingRevenue), "", "Pending or invoiced"],
          [],
          ["OPERATING EXPENSES", "", "", ""],
          ...categories.map((category) => [
            category.label,
            money(category.amount),
            rate(summary.totalMiles ? category.amount / summary.totalMiles : 0),
            category.behavior === "FIXED" ? "Fixed" : "Variable",
          ]),
          ["Total operating expenses", money(summary.operatingExpenses), rate(summary.costPerMile), ""],
          ["Fixed expenses", money(behavior.FIXED), "", ""],
          ["Variable expenses", money(behavior.VARIABLE), "", ""],
          [],
          ["RESULT", "", "", ""],
          ["Net profit", money(summary.netProfit), rate(summary.profitPerMile), `${summary.netMargin.toFixed(1)}% margin`],
          [],
          ["RESERVES", "", "", ""],
          ...pay.reserves.map((reserve) => [
            reserve.name,
            money(reserve.amount),
            "",
            `${reserve.pct}% of ${reserve.basis === "OPERATING_PROFIT" ? "operating profit" : "gross revenue"}`,
          ]),
          ["Total reserves", money(pay.reserveTotal), "", "Every active bucket"],
          ["Safe to pay yourself", money(pay.safeToPay), "", "After expenses and reserves"],
          [],
          ["BROKERS", "", "", ""],
          ...brokerPerformance(periodLoads, thresholds).map((broker) => [
            broker.broker,
            money(broker.revenue),
            rate(broker.profitPerMile),
            `${broker.loadCount} loads, ${money(broker.tripProfit)} trip profit`,
          ]),
        ],
      };
    }

    case "mileage": {
      // Priced exactly like the dashboard's deadhead card: the period's true
      // cost per mile, rounded to the cent. The old variable-cost-only figure
      // printed a different "deadhead cost" than the app showed on screen.
      const basis = calculateTrueCostPerMile(loads, expenses, period, settings, period.label);
      const deadhead = calculateDeadheadCost(summary, basis, settings, null);
      return {
        title: `Mileage - ${period.label}`,
        columns: ["Date", "Load Number", "Origin", "Destination", "Loaded Miles", "Deadhead Miles", "Total Miles", "Deadhead %"],
        rows: [
          ...periodLoads.map((load) => [
            load.date,
            load.loadNumber ?? "",
            `${load.originCity}, ${load.originState}`,
            `${load.destinationCity}, ${load.destinationState}`,
            load.loadedMiles,
            load.deadheadMiles,
            load.metrics.totalMiles,
            Number(load.metrics.deadheadPct.toFixed(1)),
          ]),
          [],
          ["TOTALS", "", "", "", summary.loadedMiles, summary.deadheadMiles, summary.totalMiles, Number(summary.deadheadPct.toFixed(1))],
          [`Deadhead cost (${rate(deadhead.costPerMile)}/mi true cost): ${money(deadhead.cost)}`, "", "", "", "", "", "", ""],
          [
            `Deadhead cost per total mile: ${rate(deadhead.dragPerTotalMile)}`,
            "", "", "", "", "", "", "",
          ],
        ],
      };
    }

    case "maintenance":
    default:
      return {
        title: `Maintenance - ${primaryTruck(dataset.trucks).name}`,
        columns: [
          "Service Date", "Type", "Tracked By", "Odometer", "Cost", "Vendor",
          "Next Service Date", "Next Service Odometer", "In Expense Ledger", "Notes",
        ],
        rows: dataset.maintenanceRecords.map((record) => [
          record.serviceDate,
          maintenanceLabel(record.type),
          record.basis,
          record.odometer ?? "",
          money(record.cost),
          record.vendor ?? "",
          record.nextServiceDate ?? "",
          record.nextServiceOdometer ?? "",
          record.expenseId ? "Yes" : "No",
          record.notes ?? "",
        ]),
      };
  }
}

/**
 * A leading =, +, -, @, tab or CR turns a cell into a formula in Excel,
 * Sheets and LibreOffice. These exports carry vendor names, descriptions and
 * notes typed by the user and are opened by a third party (the accountant),
 * so text is neutralised with a leading apostrophe before quoting.
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/** RFC 4180 quoting, with a BOM so Excel opens UTF-8 correctly. */
export function toCsv(table: ReportTable): string {
  const escape = (value: string | number): string => {
    if (typeof value === "number") return String(value);
    const text = String(value ?? "");
    const neutralised = FORMULA_TRIGGER.test(text) ? `'${text}` : text;
    return /[",\n\r]/.test(neutralised) || neutralised !== text
      ? `"${neutralised.replace(/"/g, '""')}"`
      : neutralised;
  };

  const lines = [
    table.columns.map(escape).join(","),
    ...table.rows.map((row) => row.map(escape).join(",")),
  ];

  return `﻿${lines.join("\r\n")}\r\n`;
}

export function reportFileName(id: ReportId, period: Period): string {
  return `onroad-books-${id}-${period.start}-to-${period.end}.csv`;
}
