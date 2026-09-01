/**
 * Accountant exports.
 *
 * Each report is defined once as columns + rows, so a new output format
 * (PDF, XLSX) is a new renderer rather than five new report implementations.
 * CSV, XLSX and PDF renderers consume the same table definition.
 */

import {
  behaviorTotals,
  brokerPerformance,
  categoryTotals,
  expensesInPeriod,
  fuelInPeriod,
  linkedFuelByLoad,
  loadsInPeriod,
  summarizeFuel,
  thresholdsFromSettings,
  withMetricsAll,
} from "./calculations";
import { calculateTrueCostPerMile } from "./finance/cost-per-mile";
import { calculateDeadheadCost } from "./finance/deadhead";
import { buildFinancialSummary } from "./finance/financial-summary";
import { behaviorOf, categoryLabel } from "./categories";
import { maintenanceLabel } from "./maintenance";
import { equipmentTypeLabel, loadCapacityLabel } from "./load-details";
import type { Period } from "./periods";
import type { Dataset } from "./types";
import { expensesForTruck, loadsForTruck, primaryTruck, truckById } from "./fleet";
import {
  FINANCIAL_MODEL_VERSION,
  financialTreatmentOf,
} from "./finance/terminology";

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
  { id: "profit-loss", label: "Financial Summary", description: "Performance, collections and debt service" },
  { id: "mileage", label: "Mileage Report", description: "Loaded, deadhead and total miles by load" },
  { id: "maintenance", label: "Maintenance Report", description: "Service history and next service due" },
];

export const REPORT_IDS = REPORTS.map((r) => r.id);

export interface ReportTable {
  title: string;
  columns: string[];
  rows: (string | number)[][];
  calculationVersion?: number;
}

const money = (value: number | null | undefined) =>
  Number((Number.isFinite(value) ? (value as number) : 0).toFixed(2));
const rate = (value: number | null | undefined) =>
  Number((Number.isFinite(value) ? (value as number) : 0).toFixed(3));

export function buildReport(
  id: ReportId,
  dataset: Dataset,
  period: Period,
  truckId: string | null = null,
  includeOwnerPlanning = true,
): ReportTable {
  const selectedTruck = truckById(dataset.trucks, truckId);
  if (truckId && !selectedTruck) throw new Error("That truck does not belong to this workspace.");

  const loads = loadsForTruck(dataset.loads, truckId);
  const expenses = expensesForTruck(dataset.expenses, truckId);
  const fuelEntries = truckId
    ? dataset.fuelEntries.filter((entry) => entry.truckId === truckId)
    : dataset.fuelEntries;
  const maintenanceRecords = truckId
    ? dataset.maintenanceRecords.filter((record) => record.truckId === truckId)
    : dataset.maintenanceRecords;
  const { settings } = dataset;
  const scopeLabel = selectedTruck?.name ?? (dataset.trucks.length > 1 ? "Whole fleet" : primaryTruck(dataset.trucks).name);
  const truckName = (id: string | null) =>
    id ? (truckById(dataset.trucks, id)?.name ?? "Unknown truck") : "Business overhead";
  const thresholds = thresholdsFromSettings(settings);
  const periodLoads = withMetricsAll(
    loadsInPeriod(loads, period),
    thresholds,
    linkedFuelByLoad(dataset.fuelEntries),
  );
  const periodExpenses = expensesInPeriod(expenses, period);
  const periodFuel = fuelInPeriod(fuelEntries, period);
  const summary = buildFinancialSummary(
    loads,
    expenses,
    dataset.paymentEvents,
    period,
    settings,
    dataset.reserveAccounts,
  );

  switch (id) {
    case "loads":
      return {
        title: `Loads - ${scopeLabel} - ${period.label}`,
        calculationVersion: FINANCIAL_MODEL_VERSION,
        columns: [
          "Truck", "Pickup Date", "Delivery Date", "Ending Odometer", "Load Number", "Broker", "Origin", "Destination",
          "Equipment", "Load Type", "Length (ft)", "Weight (lb)", "Commodity",
          "Loaded Miles", "Deadhead Miles", "Total Miles", "Deadhead %",
          "Gross Rate", "Rate/Loaded Mile", "Rate/Total Mile",
          "Fuel", "Tolls", "Dispatch", "Factoring", "Other", "Driver Pay",
          "Direct Trip Costs", "Contribution Profit", "Contribution/Total Mile",
          "Contribution Margin %", "Rating", "Payment Status", "Notes",
        ],
        rows: periodLoads.map((load) => [
          truckName(load.truckId),
          load.date,
          load.deliveryDate ?? "",
          load.endingOdometer ?? "",
          load.loadNumber ?? "",
          load.broker ?? "",
          `${load.originCity}, ${load.originState}`,
          `${load.destinationCity}, ${load.destinationState}`,
          equipmentTypeLabel(load.equipmentType),
          loadCapacityLabel(load.loadCapacity),
          load.equipmentLengthFt ?? "",
          load.weightLbs ?? "",
          load.commodity ?? "",
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
          money(load.driverPay),
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
        title: `Expenses - ${scopeLabel} - ${period.label}`,
        calculationVersion: FINANCIAL_MODEL_VERSION,
        columns: [
          "Charged To", "Date", "Category", "Financial Treatment", "Fixed/Variable", "Description", "Vendor",
          "Amount", "Receipt Number", "Recurring", "Linked Load", "Notes",
        ],
        rows: periodExpenses.map((expense) => {
          const load = expense.loadId ? loads.find((l) => l.id === expense.loadId) : undefined;
          return [
            truckName(expense.truckId),
            expense.date,
            categoryLabel(expense.category),
            financialTreatmentOf(expense) === "INTEREST"
              ? "Interest Expense"
              : financialTreatmentOf(expense) === "PRINCIPAL"
                ? "Principal Payment"
                : financialTreatmentOf(expense) === "DEBT_UNALLOCATED"
                  ? "Unallocated Debt Service"
                  : "Operating Expense",
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
        title: `Fuel - ${scopeLabel} - ${period.label}`,
        calculationVersion: FINANCIAL_MODEL_VERSION,
        columns: ["Truck", "Date", "Location", "Gallons", "Price/Gallon", "Total Cost", "Odometer", "Linked Load"],
        rows: [
          ...periodFuel.map((entry) => {
            const load = entry.loadId ? loads.find((l) => l.id === entry.loadId) : undefined;
            return [
              truckName(entry.truckId),
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
          ["TOTALS", "", "", Number(fuel.totalGallons.toFixed(2)), rate(fuel.averagePricePerGallon), money(fuel.totalCost), "", ""],
          // Derived figures are labelled in place so no dollar value ever
          // lands under a gallons or odometer column.
          [`Fuel cost per mile: ${rate(fuel.fuelCostPerMile)}`, "", "", "", "", "", "", ""],
          [
            `Miles per gallon: ${fuel.milesPerGallon ? Number(fuel.milesPerGallon.toFixed(2)) : "n/a"}`,
            "", "", "", "", "", "", "",
          ],
        ],
      };
    }

    case "profit-loss": {
      // Same reserve engine as the dashboard and settlements: every active
      // bucket at its configured rate and basis. The legacy two-bucket
      // breakdown ignored custom buckets, so this export disagreed with the
      // app's Safe to Pay whenever one existed.
      const pay = summary;
      const operatingPeriodExpenses = periodExpenses.filter((expense) =>
        financialTreatmentOf(expense) === "OPERATING",
      );
      const behavior = behaviorTotals(operatingPeriodExpenses, settings);
      const categories = categoryTotals(operatingPeriodExpenses, settings);

      return {
        title: `Financial Summary - ${scopeLabel} - ${period.label}`,
        calculationVersion: FINANCIAL_MODEL_VERSION,
        columns: ["Line", "Amount", "Per Total Mile", "Notes"],
        rows: [
          ["Period", period.label, "", `${period.start} to ${period.end}`],
          ["Calculation model", `v${FINANCIAL_MODEL_VERSION}`, "", "Canonical financial terminology"],
          [],
          ["PERFORMANCE", "", "", ""],
          ["Booked Revenue", money(summary.bookedRevenue), rate(summary.revenuePerMile), `${summary.loadCount} loads`],
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
          [selectedTruck ? "TRUCK RESULT" : "RESULT", "", "", ""],
          [
            selectedTruck ? "Truck Contribution" : "Operating Profit",
            money(summary.operatingProfit),
            rate(summary.profitPerMile),
            `${summary.netMargin.toFixed(1)}% margin`,
          ],
          [],
          ["CASH AND FINANCING", "", "", ""],
          ["Collected Revenue", money(summary.collectedRevenue), "", "Assigned by recorded payment date"],
          ["Accounts Receivable", money(summary.accountsReceivable), "", "Booked but unpaid; not available cash"],
          ["Paid revenue without payment date", money(summary.unallocatedCollectedRevenue), "", "Not guessed into a cash period"],
          ["Interest Expense", money(summary.interestExpense), "", "Financing cost"],
          ["Principal Payment", money(summary.principalPayment), "", "Cash use; not an operating expense"],
          ["Unallocated Debt Service", money(summary.unallocatedDebtService), "", "Historical unsplit truck payments"],
          ["Debt Service", money(summary.debtService), "", "Interest + principal + unallocated payments"],
          ["Cash After Debt Service", money(summary.cashAfterDebtService), "", "Collected Revenue less cash operating costs and Debt Service"],
          ...(selectedTruck
            ? [
                [],
                [
                  "Company overhead and reserves",
                  "",
                  "",
                  "Excluded here; see Whole fleet for what the business keeps.",
                ],
              ]
            : includeOwnerPlanning
              ? [
                [],
                ["RESERVES", "", "", ""],
                ...pay.reserves.map((reserve) => [
                  reserve.name,
                  money(reserve.amount),
                  "",
                  `${reserve.pct}% of ${reserve.basis === "OPERATING_PROFIT" ? "Operating Profit" : "Booked Revenue"}`,
                ]),
                ["Total reserves", money(pay.reserveTotal), "", "Every active bucket"],
                ["Safe to Pay Yourself", money(pay.safeToPay), "", "Cash After Debt Service less Reserve Contributions"],
              ]
              : []),
          [],
          ["BROKERS", "", "", ""],
          ...brokerPerformance(periodLoads, thresholds).map((broker) => [
            broker.broker,
            money(broker.revenue),
            rate(broker.profitPerMile),
            `${broker.loadCount} loads, ${money(broker.tripProfit)} Contribution Profit`,
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
        title: `Mileage - ${scopeLabel} - ${period.label}`,
        calculationVersion: FINANCIAL_MODEL_VERSION,
        columns: ["Truck", "Pickup Date", "Load Number", "Origin", "Destination", "Loaded Miles", "Deadhead Miles", "Total Miles", "Deadhead %"],
        rows: [
          ...periodLoads.map((load) => [
            truckName(load.truckId),
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
          ["TOTALS", "", "", "", "", summary.loadedMiles, summary.deadheadMiles, summary.totalMiles, Number(summary.deadheadPct.toFixed(1))],
          [`Deadhead cost (${rate(deadhead.costPerMile)}/mi Actual Cost): ${money(deadhead.cost)}`, "", "", "", "", "", "", "", ""],
          [
            `Deadhead cost per total mile: ${rate(deadhead.dragPerTotalMile)}`,
            "", "", "", "", "", "", "", "",
          ],
        ],
      };
    }

    case "maintenance":
    default:
      return {
        title: `Maintenance - ${scopeLabel} - ${period.label}`,
        calculationVersion: FINANCIAL_MODEL_VERSION,
        columns: [
          "Truck", "Service Date", "Type", "Tracked By", "Odometer", "Cost", "Vendor",
          "Next Service Date", "Next Service Odometer", "In Expense Ledger", "Notes",
        ],
        rows: maintenanceRecords
          .filter((record) => record.serviceDate >= period.start && record.serviceDate <= period.end)
          .map((record) => [
          truckName(record.truckId),
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

export type ExportFormat = "csv" | "xlsx" | "pdf";

export function reportFileName(
  id: ReportId,
  period: Period,
  truckName?: string | null,
  format: ExportFormat = "csv",
): string {
  const scope = truckName
    ? `-${truckName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`
    : "";
  return `onroad-books-${id}${scope}-${period.start}-to-${period.end}.${format}`;
}
