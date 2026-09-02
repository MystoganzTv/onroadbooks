import "server-only";

import ExcelJS from "exceljs";
import type { ReportTable } from "./export";

const COLORS = {
  navy: "FF0B1F33",
  navyMid: "FF153A5B",
  blue: "FF1687D9",
  blueSoft: "FFEAF4FB",
  green: "FF16A36A",
  greenSoft: "FFE8F6EF",
  red: "FFD64545",
  redSoft: "FFFCEBEC",
  amber: "FFE5A000",
  amberSoft: "FFFFF5D9",
  ink: "FF152332",
  muted: "FF607286",
  line: "FFD9E3EC",
  surface: "FFF5F8FB",
  white: "FFFFFFFF",
} as const;

const MONEY_FORMAT = '$#,##0.00;[Red]($#,##0.00);-';
const RATE_FORMAT = '$0.00;[Red]($0.00);-';
const INTEGER_FORMAT = '#,##0;[Red](#,##0);-';
const DECIMAL_FORMAT = '#,##0.00;[Red](#,##0.00);-';
const PERCENT_FORMAT = '0.0"%";[Red](0.0"%");-';
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

type DetailKpiFormat = "money" | "integer" | "decimal" | "percent" | "rate";

interface DetailKpi {
  label: string;
  value: number;
  format: DetailKpiFormat;
  accent: string;
  note: string;
}

function safeCell(value: string | number): string | number | null {
  if (value === "") return null;
  return typeof value === "string" && FORMULA_TRIGGER.test(value) ? `'${value}` : value;
}

function numberFormat(column: string): string {
  const name = column.toLowerCase();
  if (name.includes("date")) return "yyyy-mm-dd";
  if (name.includes("%") || name.includes("margin") || name === "deadhead rate") return PERCENT_FORMAT;
  if (
    name.includes("price/gallon") ||
    (name.includes("mile") && (
      name.includes("rate") ||
      name.includes("per ") ||
      name.includes("/mile") ||
      name.includes("cost") ||
      name.includes("profit") ||
      name.includes("revenue") ||
      name.includes("contribution")
    ))
  ) return RATE_FORMAT;
  if (
    name.includes("amount") ||
    name.includes("cost") ||
    name.includes("revenue") ||
    name.includes("profit") ||
    name.includes("earned") ||
    name.includes("collected") ||
    name.includes("still owed") ||
    name.includes("business made") ||
    name.includes("business expenses") ||
    name.includes("debt payments") ||
    name.includes("cash after debt") ||
    name.includes("gross rate") ||
    name.includes("driver pay") ||
    name.includes("tax due")
  ) return MONEY_FORMAT;
  if (
    name.includes("mile") ||
    name.includes("odometer") ||
    name.includes("weight") ||
    name.includes("length") ||
    name.includes("loads") ||
    name.includes("records") ||
    name.includes("transactions") ||
    name.includes("trips") ||
    name.includes("stops")
  ) return INTEGER_FORMAT;
  if (name.includes("gallon")) return DECIMAL_FORMAT;
  return DECIMAL_FORMAT;
}

function newWorkbook(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OnRoad Books";
  workbook.company = "OnRoad Books";
  workbook.subject = "Trucking financial and operating report";
  workbook.description = "Professional financial export generated from the business ledger.";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.views = [{ x: 0, y: 0, width: 15000, height: 9000, firstSheet: 0, activeTab: 0, visibility: "visible" }];
  return workbook;
}

function reportDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Native Excel export with frozen headers, filters, print setup, and typed numeric cells. */
export async function toXlsx(table: ReportTable): Promise<Uint8Array> {
  const workbook = newWorkbook();
  writeSheet(workbook, table, "Report");
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

/** One executive workbook with a summary first and operational detail behind it. */
export async function toXlsxWorkbook(
  tables: ReportTable[],
  sheetNames: string[],
): Promise<Uint8Array> {
  const workbook = newWorkbook();
  const summaryIndex = sheetNames.indexOf("Summary");
  const summarySheet = summaryIndex >= 0 ? addWorksheet(workbook, "Summary", "landscape") : undefined;

  tables.forEach((table, index) => {
    if (index === summaryIndex) return;
    writeSheet(workbook, table, sheetNames[index] ?? `Sheet ${index + 1}`, sheetNames);
  });

  if (summarySheet && tables[summaryIndex]) {
    writeSummarySheet(workbook, tables[summaryIndex], sheetNames, summarySheet);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

function writeSheet(
  workbook: ExcelJS.Workbook,
  table: ReportTable,
  name: string,
  workbookSheets: string[] = [name],
): void {
  if (name === "Summary" && table.columns.length === 2) {
    writeSummarySheet(workbook, table, workbookSheets);
    return;
  }
  writeDetailSheet(workbook, table, name);
}

function addWorksheet(
  workbook: ExcelJS.Workbook,
  name: string,
  orientation: "portrait" | "landscape",
): ExcelJS.Worksheet {
  return workbook.addWorksheet(name, {
    properties: { defaultRowHeight: 18 },
    views: [{ state: "frozen", xSplit: orientation === "landscape" ? 2 : 1, ySplit: 10, showGridLines: false, zoomScale: 90 }],
    pageSetup: {
      orientation,
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.25, right: 0.25, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
    },
  });
}

function writeDetailSheet(workbook: ExcelJS.Workbook, table: ReportTable, name: string): void {
  const columnCount = Math.max(1, table.columns.length);
  const presentationColumnCount = Math.max(8, Math.min(columnCount, 12));
  const sheet = addWorksheet(workbook, name, columnCount > 7 ? "landscape" : "portrait");
  const lastColumn = sheet.getColumn(columnCount).letter;
  const reportLastColumn = sheet.getColumn(Math.max(columnCount, presentationColumnCount)).letter;
  const generatedDate = reportDate();

  sheet.properties.tabColor = { argb: tabColor(name) };

  sheet.mergeCells(`A1:${reportLastColumn}1`);
  const title = sheet.getCell("A1");
  title.value = table.title;
  title.font = { name: "Aptos Display", size: 18, bold: true, color: { argb: COLORS.white } };
  title.fill = solid(COLORS.navy);
  title.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 38;

  sheet.mergeCells(`A2:${reportLastColumn}2`);
  const generated = sheet.getCell("A2");
  generated.value = `ONROAD BOOKS  /  ${generatedDate}  /  FINANCIAL MODEL v${table.calculationVersion ?? "—"}`;
  generated.font = { name: "Aptos", bold: true, size: 9, color: { argb: COLORS.muted } };
  generated.alignment = { vertical: "middle" };
  sheet.getRow(2).height = 22;

  sheet.getRow(3).height = 8;
  writeDetailKpis(sheet, detailKpis(table, name), presentationColumnCount);
  sheet.getRow(8).height = 10;

  writeColumnGroups(sheet, table.columns, name, 9);

  const header = sheet.getRow(10);
  header.values = table.columns;
  for (let columnNumber = 1; columnNumber <= columnCount; columnNumber += 1) {
    const cell = header.getCell(columnNumber);
    cell.font = { name: "Aptos", bold: true, size: 9, color: { argb: COLORS.white } };
    cell.fill = solid(COLORS.navyMid);
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  }
  header.height = 38;

  if (table.rows.length === 0) {
    sheet.mergeCells(`A11:${lastColumn}13`);
    const empty = sheet.getCell("A11");
    empty.value = "No records for this period";
    empty.font = { name: "Aptos", size: 12, italic: true, color: { argb: COLORS.muted } };
    empty.fill = solid(COLORS.surface);
    empty.alignment = { horizontal: "center", vertical: "middle" };
  } else {
    for (const values of table.rows) sheet.addRow(values.map(safeCell));
    styleDetailRows(sheet, table, 11);
    sheet.autoFilter = { from: { row: 10, column: 1 }, to: { row: 10, column: columnCount } };
  }

  if (name === "Monthly Trends") styleMonthlyTrends(sheet);
  if (name === "Review & Checks") styleReviewChecks(sheet, table);

  setColumnWidths(sheet, table);
  setReadableRowHeights(sheet, table, 11);
  for (let column = columnCount + 1; column <= presentationColumnCount; column += 1) {
    sheet.getColumn(column).width = 12;
  }
  sheet.pageSetup.fitToWidth = columnCount > 24 ? 3 : columnCount > 14 ? 2 : 1;
  sheet.pageSetup.printTitlesRow = "9:10";
  sheet.pageSetup.printArea = `A1:${reportLastColumn}${Math.max(sheet.rowCount, 13)}`;
  sheet.headerFooter.oddHeader = `&L${table.title}&ROnRoad Books`;
  sheet.headerFooter.oddFooter = "Confidential  •  Prepared from the business ledger  |  &P of &N";
}

function tabColor(sheetName: string): string {
  if (sheetName === "Profit Loss") return COLORS.green;
  if (sheetName === "Expenses" || sheetName === "Review & Checks") return COLORS.red;
  if (sheetName === "Fuel" || sheetName === "Maintenance") return COLORS.amber;
  return COLORS.blue;
}

function columnIndex(table: ReportTable, label: string): number {
  return table.columns.findIndex((column) => column.toLowerCase() === label.toLowerCase());
}

function numericValue(row: Array<string | number>, index: number): number {
  return index >= 0 && typeof row[index] === "number" ? Number(row[index]) : 0;
}

function recordRows(table: ReportTable, dateColumn: string): Array<Array<string | number>> {
  const dateIndex = columnIndex(table, dateColumn);
  return table.rows.filter((row) => dateIndex >= 0 && String(row[dateIndex] ?? "").trim() !== "");
}

function sumRows(
  rows: Array<Array<string | number>>,
  table: ReportTable,
  column: string,
  predicate: (row: Array<string | number>) => boolean = () => true,
): number {
  const index = columnIndex(table, column);
  return rows.reduce((total, row) => total + (predicate(row) ? numericValue(row, index) : 0), 0);
}

function statementValue(table: ReportTable, label: string): number {
  const row = table.rows.find((candidate) => String(candidate[0] ?? "").trim().toLowerCase() === label.toLowerCase());
  return row && typeof row[1] === "number" ? Number(row[1]) : 0;
}

function detailKpis(table: ReportTable, sheetName: string): DetailKpi[] {
  if (sheetName === "Monthly Trends") {
    const earned = sumRows(table.rows, table, "You Earned");
    const profit = sumRows(table.rows, table, "Business Made");
    const cashAfterDebt = sumRows(table.rows, table, "Cash After Debt");
    const miles = sumRows(table.rows, table, "Miles");
    return [
      { label: "YOU EARNED", value: earned, format: "money", accent: COLORS.blue, note: "Revenue booked across 12 months" },
      { label: "YOUR BUSINESS MADE", value: profit, format: "money", accent: profit >= 0 ? COLORS.green : COLORS.red, note: "After business expenses" },
      cashPositionKpi(cashAfterDebt),
      { label: "PROFIT / MILE", value: miles ? profit / miles : 0, format: "rate", accent: COLORS.green, note: `Across ${Math.round(miles).toLocaleString("en-US")} miles` },
    ];
  }

  if (sheetName === "Review & Checks") {
    const actionRows = table.rows.filter((row) => row[0] === "ACTION");
    const reconciliations = table.rows.filter((row) => row[0] === "OK" && /reconciles/i.test(String(row[1] ?? "")));
    return [
      { label: "ACTIONS NEEDED", value: actionRows.length, format: "integer", accent: actionRows.length ? COLORS.red : COLORS.green, note: actionRows.length ? "Workbook status: NEEDS REVIEW" : "Workbook status: READY" },
      { label: "RECORDS TO REVIEW", value: sumRows(actionRows, table, "Records"), format: "integer", accent: actionRows.length ? COLORS.amber : COLORS.green, note: "Exceptions listed first" },
      { label: "RECONCILIATIONS PASSED", value: reconciliations.length, format: "integer", accent: COLORS.green, note: "Canonical totals tied out" },
      { label: "CHECKS RUN", value: table.rows.length, format: "integer", accent: COLORS.navyMid, note: "Data quality + financial checks" },
    ];
  }

  if (sheetName === "Loads") {
    return [
      { label: "LOADS MOVED", value: table.rows.length, format: "integer", accent: COLORS.navyMid, note: "Loads in this report" },
      { label: "HOW MUCH YOU EARNED", value: sumRows(table.rows, table, "Gross Rate"), format: "money", accent: COLORS.blue, note: "Booked load revenue" },
      { label: "MILES RUN", value: sumRows(table.rows, table, "Total Miles"), format: "integer", accent: COLORS.navyMid, note: "Loaded + deadhead" },
      { label: "AFTER DIRECT TRIP COSTS", value: sumRows(table.rows, table, "Contribution Profit"), format: "money", accent: COLORS.green, note: "Before shared operating costs" },
    ];
  }

  if (sheetName === "Expenses") {
    const treatmentIndex = columnIndex(table, "Financial Treatment");
    const amount = (treatment: RegExp) => sumRows(table.rows, table, "Amount", (row) => treatment.test(String(row[treatmentIndex] ?? "")));
    return [
      { label: "HOW MUCH WENT OUT", value: sumRows(table.rows, table, "Amount"), format: "money", accent: COLORS.red, note: "All recorded cash activity" },
      { label: "BUSINESS EXPENSES", value: amount(/^Operating Expense$/i), format: "money", accent: COLORS.red, note: "Costs used in operating profit" },
      { label: "DEBT PAYMENTS", value: amount(/Interest Expense|Principal Payment|Debt Service/i), format: "money", accent: COLORS.amber, note: "Interest + principal" },
      { label: "TRANSACTIONS", value: table.rows.length, format: "integer", accent: COLORS.navyMid, note: "Rows included below" },
    ];
  }

  if (sheetName === "Fuel") {
    const rows = recordRows(table, "Date");
    const gallons = sumRows(rows, table, "Gallons");
    const spend = sumRows(rows, table, "Total Cost");
    return [
      { label: "HOW MUCH YOU SPENT", value: spend, format: "money", accent: COLORS.red, note: "Recorded fuel purchases" },
      { label: "GALLONS PURCHASED", value: gallons, format: "decimal", accent: COLORS.blue, note: "Fuel volume recorded" },
      { label: "AVERAGE PRICE", value: gallons ? spend / gallons : 0, format: "rate", accent: COLORS.amber, note: "Weighted price per gallon" },
      { label: "FUEL STOPS", value: rows.length, format: "integer", accent: COLORS.navyMid, note: "Purchases in this period" },
    ];
  }

  if (sheetName === "Profit Loss") {
    const profit = statementValue(table, "Operating Profit");
    const cashAfterDebt = statementValue(table, "Cash After Debt Service");
    return [
      { label: "YOU EARNED", value: statementValue(table, "Booked Revenue"), format: "money", accent: COLORS.blue, note: "Revenue booked in the period" },
      { label: "BUSINESS EXPENSES", value: statementValue(table, "Total operating expenses"), format: "money", accent: COLORS.red, note: "Operating costs" },
      { label: "YOUR BUSINESS MADE", value: profit, format: "money", accent: profit >= 0 ? COLORS.green : COLORS.red, note: "Revenue less operating costs" },
      cashPositionKpi(cashAfterDebt),
    ];
  }

  if (sheetName === "Mileage") {
    const rows = recordRows(table, "Pickup Date");
    const loaded = sumRows(rows, table, "Loaded Miles");
    const deadhead = sumRows(rows, table, "Deadhead Miles");
    const total = loaded + deadhead;
    return [
      { label: "TRIPS", value: rows.length, format: "integer", accent: COLORS.navyMid, note: "Loads with mileage" },
      { label: "LOADED MILES", value: loaded, format: "integer", accent: COLORS.blue, note: "Revenue-producing miles" },
      { label: "DEADHEAD MILES", value: deadhead, format: "integer", accent: COLORS.amber, note: "Miles without freight" },
      { label: "DEADHEAD RATE", value: total ? deadhead / total * 100 : 0, format: "percent", accent: COLORS.green, note: "Share of total miles" },
    ];
  }

  if (sheetName === "Maintenance") {
    const rows = recordRows(table, "Service Date");
    const truckIndex = columnIndex(table, "Truck");
    const nextDateIndex = columnIndex(table, "Next Service Date");
    const nextOdometerIndex = columnIndex(table, "Next Service Odometer");
    const trucks = new Set(rows.map((row) => String(row[truckIndex] ?? "")).filter(Boolean));
    const scheduled = rows.filter((row) => row[nextDateIndex] || row[nextOdometerIndex]).length;
    return [
      { label: "HOW MUCH YOU SPENT", value: sumRows(rows, table, "Cost"), format: "money", accent: COLORS.red, note: "Recorded maintenance cost" },
      { label: "SERVICE RECORDS", value: rows.length, format: "integer", accent: COLORS.navyMid, note: "Completed work below" },
      { label: "TRUCKS SERVICED", value: trucks.size, format: "integer", accent: COLORS.blue, note: "Distinct units" },
      { label: "NEXT SERVICE SET", value: scheduled, format: "integer", accent: COLORS.green, note: "Records with a due trigger" },
    ];
  }

  return [
    { label: "RECORDS", value: table.rows.length, format: "integer", accent: COLORS.blue, note: "Rows included in this report" },
  ];
}

function cashPositionKpi(cashAfterDebt: number): DetailKpi {
  return cashAfterDebt < 0
    ? {
      label: "CASH GAP AFTER DEBT",
      value: Math.abs(cashAfterDebt),
      format: "money",
      accent: COLORS.red,
      note: "Cash out + debt exceeded collections",
    }
    : {
      label: "CASH AFTER DEBT",
      value: cashAfterDebt,
      format: "money",
      accent: COLORS.green,
      note: "Collected cash less business cash out + debt",
    };
}

function writeDetailKpis(sheet: ExcelJS.Worksheet, kpis: DetailKpi[], availableColumns: number): void {
  const count = Math.max(1, Math.min(kpis.length, availableColumns));
  const baseWidth = Math.floor(availableColumns / count);
  let startColumn = 1;

  kpis.slice(0, count).forEach((kpi, index) => {
    const width = baseWidth + (index < availableColumns % count ? 1 : 0);
    const endColumn = startColumn + width - 1;
    const start = `${sheet.getColumn(startColumn).letter}4`;
    const end = `${sheet.getColumn(endColumn).letter}7`;
    writeKpiCard(sheet, `${start}:${end}`, kpi.label, kpi.value, kpi.format, kpi.accent, kpi.note);
    startColumn = endColumn + 1;
  });

  sheet.getRow(4).height = 26;
  sheet.getRow(5).height = 22;
  sheet.getRow(6).height = 22;
  sheet.getRow(7).height = 24;
}

function writeColumnGroups(sheet: ExcelJS.Worksheet, columns: string[], sheetName: string, rowNumber: number): void {
  const groups = columnGroups(sheetName, columns.length);
  const row = sheet.getRow(rowNumber);
  row.height = 22;

  for (const [index, group] of groups.entries()) {
    const start = sheet.getColumn(group.start).letter;
    const end = sheet.getColumn(group.end).letter;
    if (group.end > group.start) sheet.mergeCells(`${start}${rowNumber}:${end}${rowNumber}`);
    const cell = sheet.getCell(`${start}${rowNumber}`);
    cell.value = group.label;
    cell.font = { name: "Aptos", bold: true, size: 9, color: { argb: index % 2 ? COLORS.blue : COLORS.navyMid } };
    cell.fill = solid(index % 2 ? "FFF0F6FA" : COLORS.blueSoft);
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = { bottom: { style: "thin", color: { argb: COLORS.line } } };
  }
}

function columnGroups(sheetName: string, count: number): Array<{ label: string; start: number; end: number }> {
  if (sheetName === "Monthly Trends" && count >= 11) return [
    { label: "PERIOD", start: 1, end: 1 },
    { label: "MONEY", start: 2, end: 8 },
    { label: "OPERATIONS", start: 9, end: 11 },
  ];
  if (sheetName === "Review & Checks" && count >= 7) return [
    { label: "RESULT", start: 1, end: 1 },
    { label: "WHAT HAPPENED", start: 2, end: 4 },
    { label: "WHY IT MATTERS", start: 5, end: 5 },
    { label: "WHAT TO DO NEXT", start: 6, end: 7 },
  ];
  if (sheetName === "Loads" && count >= 33) return [
    { label: "LOAD & ROUTE", start: 1, end: 13 },
    { label: "MILEAGE", start: 14, end: 17 },
    { label: "REVENUE", start: 18, end: 20 },
    { label: "DIRECT COSTS", start: 21, end: 27 },
    { label: "PROFITABILITY", start: 28, end: 30 },
    { label: "STATUS", start: 31, end: 33 },
  ];
  if (sheetName === "Expenses" && count >= 12) return [
    { label: "ASSIGNMENT", start: 1, end: 2 },
    { label: "CLASSIFICATION", start: 3, end: 5 },
    { label: "TRANSACTION", start: 6, end: 8 },
    { label: "REFERENCES", start: 9, end: 12 },
  ];
  if (sheetName === "Mileage" && count >= 9) return [
    { label: "TRIP", start: 1, end: 5 },
    { label: "MILES", start: 6, end: 9 },
  ];
  if (sheetName === "Maintenance" && count >= 11) return [
    { label: "SERVICE RECORD", start: 1, end: 7 },
    { label: "NEXT SERVICE", start: 8, end: 11 },
  ];
  if (sheetName === "Fuel" && count >= 8) return [
    { label: "FUEL ACTIVITY", start: 1, end: 6 },
    { label: "LINKAGE", start: 7, end: 8 },
  ];
  if (sheetName === "Profit Loss") return [{ label: "FINANCIAL STATEMENT", start: 1, end: count }];
  return [{ label: "REPORT DETAIL", start: 1, end: count }];
}

function styleDetailRows(sheet: ExcelJS.Worksheet, table: ReportTable, firstDataRow: number): void {
  const columnCount = table.columns.length;
  const statement = table.columns[0] === "Line";

  for (let rowNumber = firstDataRow; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const source = table.rows[rowNumber - firstDataRow] ?? [];
    const first = String(source[0] ?? "").trim();
    const blank = source.every((value) => value === "" || value === undefined);
    const section = statement && /^[A-Z][A-Z &]+$/.test(first);
    const total = /^(TOTALS?|Total |Operating Profit|Cash After Debt Service|Safe to Pay Yourself|Truck Contribution)/i.test(first);

    row.height = blank ? 9 : section ? 24 : 21;
    for (let columnNumber = 1; columnNumber <= columnCount; columnNumber += 1) {
      const cell = row.getCell(columnNumber);
      cell.font = { name: "Aptos", size: 10, color: { argb: COLORS.ink } };
      cell.alignment = {
        vertical: "middle",
        horizontal: typeof cell.value === "number" ? "right" : "left",
        wrapText: table.columns[columnNumber - 1] === "Notes",
      };
      cell.fill = solid(blank ? COLORS.white : rowNumber % 2 === 0 ? COLORS.surface : COLORS.white);
      cell.border = blank ? {} : { bottom: { style: "hair", color: { argb: COLORS.line } } };
      if (typeof cell.value === "number") cell.numFmt = numberFormat(table.columns[columnNumber - 1] ?? "");
    }

    if (section) {
      for (let columnNumber = 1; columnNumber <= columnCount; columnNumber += 1) {
        const cell = row.getCell(columnNumber);
        cell.fill = solid(COLORS.blueSoft);
        cell.font = { name: "Aptos", bold: true, size: 9, color: { argb: COLORS.navyMid } };
        cell.border = { bottom: { style: "thin", color: { argb: COLORS.blue } } };
      }
    } else if (total) {
      for (let columnNumber = 1; columnNumber <= columnCount; columnNumber += 1) {
        const cell = row.getCell(columnNumber);
        cell.font = { name: "Aptos", bold: true, size: 10, color: { argb: COLORS.ink } };
        cell.fill = solid(COLORS.greenSoft);
        cell.border = { top: { style: "thin", color: { argb: COLORS.green } }, bottom: { style: "thin", color: { argb: COLORS.line } } };
      }
    }

    const statusColumn = table.columns.findIndex((column) => /^(Rating|Payment Status|Status)$/.test(column)) + 1;
    if (statusColumn > 0 && !blank) styleStatusCell(row.getCell(statusColumn));

    row.eachCell((cell) => {
      if (typeof cell.value === "number" && cell.value < 0) {
        cell.font = { ...cell.font, color: { argb: COLORS.red } };
      }
    });
  }
}

function styleStatusCell(cell: ExcelJS.Cell): void {
  const value = String(cell.value ?? "").toUpperCase();
  const positive = value === "GREAT" || value === "GOOD" || value === "PAID" || value === "OK" || value === "READY";
  const warning = value === "MARGINAL" || value === "INVOICED" || value === "PENDING" || value === "REVIEW";
  cell.font = { name: "Aptos", bold: true, size: 9, color: { argb: positive ? COLORS.green : warning ? COLORS.amber : COLORS.red } };
  cell.fill = solid(positive ? COLORS.greenSoft : warning ? COLORS.amberSoft : COLORS.redSoft);
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

function styleMonthlyTrends(sheet: ExcelJS.Worksheet): void {
  const startRow = 11;
  const endRow = Math.max(startRow, sheet.rowCount);
  sheet.addConditionalFormatting({
    ref: `B${startRow}:B${endRow}`,
    rules: [{
      type: "colorScale",
      priority: 1,
      cfvo: [{ type: "min" }, { type: "max" }],
      color: [{ argb: COLORS.white }, { argb: COLORS.blueSoft }],
    }],
  });
  for (const column of ["F", "H", "J"]) {
    sheet.addConditionalFormatting({
      ref: `${column}${startRow}:${column}${endRow}`,
      rules: [
        {
          type: "cellIs",
          priority: 2,
          operator: "lessThan",
          formulae: [0],
          style: { font: { color: { argb: COLORS.red }, bold: true }, fill: solid(COLORS.redSoft) },
        },
        {
          type: "cellIs",
          priority: 3,
          operator: "greaterThan",
          formulae: [-0.0000001],
          style: { font: { color: { argb: COLORS.green }, bold: true }, fill: solid(COLORS.greenSoft) },
        },
      ],
    });
  }
}

function styleReviewChecks(sheet: ExcelJS.Worksheet, table: ReportTable): void {
  const routeColumn = columnIndex(table, "Open in OnRoad") + 1;
  for (let rowNumber = 11; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.height = 44;
    for (const column of [2, 5, 6]) {
      row.getCell(column).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    }
    const route = String(row.getCell(routeColumn).value ?? "");
    if (route.startsWith("/")) {
      row.getCell(routeColumn).value = {
        text: "Open →",
        hyperlink: `https://onroadbooks.com${route}`,
        tooltip: "Open this record area in OnRoad Books",
      };
      row.getCell(routeColumn).font = { name: "Aptos", bold: true, size: 10, color: { argb: COLORS.blue }, underline: true };
      row.getCell(routeColumn).alignment = { vertical: "middle", horizontal: "center" };
    } else {
      row.getCell(routeColumn).value = "—";
      row.getCell(routeColumn).font = { name: "Aptos", size: 10, color: { argb: COLORS.muted } };
      row.getCell(routeColumn).alignment = { vertical: "middle", horizontal: "center" };
    }
  }
}

function setColumnWidths(sheet: ExcelJS.Worksheet, table: ReportTable): void {
  table.columns.forEach((header, index) => {
    const column = sheet.getColumn(index + 1);
    const sample = table.rows.slice(0, 250).map((row) => String(row[index] ?? ""));
    const natural = Math.max(header.length + 2, ...sample.map((value) => Math.min(value.length + 2, 44)));
    const lower = header.toLowerCase();
    const numeric = /amount|cost|revenue|profit|rate|mile|gallon|odometer|weight|length|%/.test(lower);
    const date = lower.includes("date");
    const longText = /notes|description|origin|destination|linked load|financial treatment|what happened|why it matters|what to do/.test(lower);
    column.width = longText
      ? Math.min(38, Math.max(20, natural))
      : date
        ? 15
        : numeric
          ? Math.min(18, Math.max(13, natural))
          : Math.min(26, Math.max(13, natural));
  });
}

function setReadableRowHeights(sheet: ExcelJS.Worksheet, table: ReportTable, firstDataRow: number): void {
  const wrappedColumns = table.columns
    .map((header, index) => ({ header: header.toLowerCase(), index }))
    .filter(({ header }) => /notes|description|what happened|why it matters|what to do/.test(header));

  table.rows.forEach((values, rowIndex) => {
    const row = sheet.getRow(firstDataRow + rowIndex);
    let requiredHeight = Number(row.height) || 21;
    for (const { index } of wrappedColumns) {
      const text = String(values[index] ?? "").trim();
      if (!text) continue;
      const width = Number(sheet.getColumn(index + 1).width) || 20;
      const lines = Math.max(1, Math.ceil(text.length / Math.max(8, width - 2)));
      requiredHeight = Math.max(requiredHeight, Math.min(66, lines * 15 + 6));
      row.getCell(index + 1).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    }
    row.height = requiredHeight;
  });
}

function writeSummarySheet(
  workbook: ExcelJS.Workbook,
  table: ReportTable,
  workbookSheets: string[],
  existingSheet?: ExcelJS.Worksheet,
): void {
  const sheet = existingSheet ?? addWorksheet(workbook, "Summary", "landscape");
  sheet.views = [{ state: "frozen", ySplit: 4, showGridLines: false, zoomScale: 95 }];
  sheet.pageSetup.fitToWidth = 1;
  sheet.properties.tabColor = { argb: COLORS.navyMid };

  const entries = new Map(table.rows.map((row) => [String(row[0] ?? "").trim(), row[1]]));
  const value = (label: string): string | number => entries.get(label) ?? 0;
  const business = String(value("Business"));
  const year = String(value("Year"));
  const model = String(value("Calculation model"));
  const generatedDate = reportDate();

  const widths = [20, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12];
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });

  sheet.mergeCells("A1:M2");
  const title = sheet.getCell("A1");
  title.value = `${business}  /  ${year} YEAR-END REPORT`;
  title.font = { name: "Aptos Display", size: 22, bold: true, color: { argb: COLORS.white } };
  title.fill = solid(COLORS.navy);
  title.alignment = { horizontal: "left", vertical: "middle" };
  sheet.getRow(1).height = 28;
  sheet.getRow(2).height = 20;

  sheet.mergeCells("A3:M3");
  const meta = sheet.getCell("A3");
  meta.value = `ONROAD BOOKS  •  PERIOD ${value("Period covered")}  •  MODEL ${model}  •  GENERATED ${generatedDate}`;
  meta.font = { name: "Aptos", bold: true, size: 9, color: { argb: COLORS.muted } };
  meta.fill = solid(COLORS.surface);
  meta.alignment = { vertical: "middle" };
  sheet.getRow(3).height = 23;

  const operatingProfit = Number(value("Operating Profit"));
  writeKpiCard(sheet, "A5:C8", "YOU EARNED", Number(value("Booked Revenue")), "money", COLORS.blue, "Revenue booked in the year");
  writeKpiCard(sheet, "D5:F8", "YOUR BUSINESS MADE", operatingProfit, "money", operatingProfit >= 0 ? COLORS.green : COLORS.red, "After business expenses");
  writeKpiCard(sheet, "G5:I8", "YOU COLLECTED", Number(value("Collected Revenue")), "money", COLORS.navyMid, "Cash received from customers");
  writeKpiCard(sheet, "J5:M8", "STILL OWED", Number(value("Accounts Receivable")), "money", COLORS.amber, "Earned but not yet collected");

  writeSectionBand(sheet, 10, "YOUR YEAR BY MONTH", "M");
  writeMonthlySummaryMatrix(workbook, sheet);

  writeSectionBand(sheet, 18, "YOUR MONEY AT A GLANCE", "M");
  const financialPairs: Array<[
    [string, string | number, "money" | "integer" | "rate"],
    [string, string | number, "money" | "integer" | "rate"],
  ]> = [
    [["You earned", value("Booked Revenue"), "money"], ["You collected", value("Collected Revenue"), "money"]],
    [["Business expenses", value("Operating expenses"), "money"], ["Still owed", value("Accounts Receivable"), "money"]],
    [["Your business made", value("Operating Profit"), "money"], ["Debt payments", value("Debt Service"), "money"]],
    [["Profit / mile", Number(value("Operating Profit")) / Math.max(1, Number(value("Total miles"))), "rate"], ["Cash after debt", value("Cash After Debt Service"), "money"]],
  ];
  financialPairs.forEach((pair, index) => writeWideSummaryPair(sheet, 19 + index, pair[0], pair[1]));

  writeSectionBand(sheet, 24, "OPERATING SNAPSHOT", "M");
  const operationPairs: typeof financialPairs = [
    [["Loads recorded", value("Loads recorded"), "integer"], ["Total miles", value("Total miles"), "integer"]],
    [["Loaded miles", value("Loaded miles"), "integer"], ["Deadhead miles", value("Deadhead miles"), "integer"]],
    [["Actual cost / mile", value("Actual Cost per Mile"), "rate"], ["Fuel purchased", value("Fuel purchased (gallons)"), "integer"]],
  ];
  operationPairs.forEach((pair, index) => writeWideSummaryPair(sheet, 25 + index, pair[0], pair[1]));

  const categoryRows = table.rows.filter((row) => /^\s{2}\S/.test(String(row[0] ?? "")));
  const costStart = 29;
  writeSectionBand(sheet, costStart, "WHERE BUSINESS EXPENSES WENT", "M");
  mergeCostMixRow(sheet, costStart + 1);
  sheet.getCell(costStart + 1, 1).value = "Category";
  sheet.getCell(costStart + 1, 9).value = "Amount";
  sheet.getCell(costStart + 1, 12).value = "Share";
  styleSmallHeader(sheet.getRow(costStart + 1), [1, 9, 12]);

  const costTotal = categoryRows.reduce((sum, row) => sum + Number(row[1] ?? 0), 0);
  const visibleCategories = categoryRows.slice(0, 7).map((row) => [String(row[0]).trim(), Number(row[1] ?? 0)] as const);
  const otherAmount = categoryRows.slice(7).reduce((sum, row) => sum + Number(row[1] ?? 0), 0);
  if (otherAmount > 0) visibleCategories.push(["Other operating costs", otherAmount]);

  let rowNumber = costStart + 2;
  for (const [label, amount] of visibleCategories) {
    mergeCostMixRow(sheet, rowNumber);
    sheet.getCell(rowNumber, 1).value = label;
    sheet.getCell(rowNumber, 9).value = amount;
    sheet.getCell(rowNumber, 9).numFmt = MONEY_FORMAT;
    sheet.getCell(rowNumber, 12).value = costTotal ? amount / costTotal : 0;
    sheet.getCell(rowNumber, 12).numFmt = "0.0%";
    styleSummaryDataRow(sheet, rowNumber, 1, 13);
    rowNumber += 1;
  }
  mergeCostMixRow(sheet, rowNumber);
  sheet.getCell(rowNumber, 1).value = "Total business expenses";
  sheet.getCell(rowNumber, 9).value = costTotal;
  sheet.getCell(rowNumber, 9).numFmt = MONEY_FORMAT;
  sheet.getCell(rowNumber, 12).value = categoryRows.length ? 1 : 0;
  sheet.getCell(rowNumber, 12).numFmt = "0.0%";
  styleSummaryTotalRow(sheet, rowNumber, 1, 13);

  const reviewRow = rowNumber + 2;
  writeSectionBand(sheet, reviewRow, "DATA REVIEW", "M");
  writeSummaryReviewBanner(workbook, sheet, reviewRow + 1);

  const noteRow = reviewRow + 5;
  writeSectionBand(sheet, noteRow, "REPORT NOTES", "M");
  sheet.mergeCells(`A${noteRow + 1}:M${noteRow + 2}`);
  const note = sheet.getCell(noteRow + 1, 1);
  note.value = String(value("Note"));
  note.font = { name: "Aptos", size: 10, italic: true, color: { argb: COLORS.muted } };
  note.fill = solid(COLORS.surface);
  note.alignment = { vertical: "middle", wrapText: true };

  const navigationRow = noteRow + 4;
  sheet.getCell(navigationRow, 1).value = "WORKBOOK NAVIGATION";
  sheet.getCell(navigationRow, 1).font = { name: "Aptos", bold: true, size: 9, color: { argb: COLORS.navyMid } };
  const navigationBlocks = [[1, 3], [4, 6], [7, 9], [10, 13]] as const;
  workbookSheets.filter((sheetName) => sheetName !== "Summary").slice(0, 8).forEach((sheetName, index) => {
    const [from, to] = navigationBlocks[index % 4];
    const navigationLine = navigationRow + 1 + Math.floor(index / 4);
    sheet.mergeCells(navigationLine, from, navigationLine, to);
    const cell = sheet.getCell(navigationLine, from);
    cell.value = { text: sheetName, hyperlink: `#'${sheetName.replace(/'/g, "''")}'!A1` };
    cell.font = { name: "Aptos", bold: true, size: 10, color: { argb: COLORS.blue }, underline: true };
  });

  sheet.pageSetup.printArea = `A1:M${navigationRow + 3}`;
  sheet.headerFooter.oddFooter = "OnRoad Books  •  Confidential year-end report  |  &P of &N";
}

function writeMonthlySummaryMatrix(workbook: ExcelJS.Workbook, sheet: ExcelJS.Worksheet): void {
  const source = workbook.getWorksheet("Monthly Trends");
  const rows: Array<{ label: string; column: number; format: string; accent: string }> = [
    { label: "You earned", column: 2, format: MONEY_FORMAT, accent: COLORS.blue },
    { label: "Business made", column: 6, format: MONEY_FORMAT, accent: COLORS.green },
    { label: "Cash after debt", column: 8, format: MONEY_FORMAT, accent: COLORS.navyMid },
    { label: "Profit / mile", column: 10, format: RATE_FORMAT, accent: COLORS.amber },
  ];

  sheet.getCell("A11").value = "Month";
  for (let month = 0; month < 12; month += 1) {
    const summaryColumn = month + 2;
    const sourceRow = month + 11;
    const monthCell = source?.getCell(sourceRow, 1);
    sheet.getCell(11, summaryColumn).value = source
      ? { formula: `'Monthly Trends'!A${sourceRow}`, result: scalarValue(monthCell?.value, "") }
      : new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(2026, month, 1));
  }

  rows.forEach((item, index) => {
    const summaryRow = index + 12;
    const labelCell = sheet.getCell(summaryRow, 1);
    labelCell.value = item.label;
    labelCell.font = { name: "Aptos", bold: true, size: 9, color: { argb: item.accent } };
    labelCell.fill = solid(COLORS.surface);
    labelCell.alignment = { vertical: "middle", horizontal: "left" };
    for (let month = 0; month < 12; month += 1) {
      const summaryColumn = month + 2;
      const sourceRow = month + 11;
      const sourceCell = source?.getCell(sourceRow, item.column);
      const cell = sheet.getCell(summaryRow, summaryColumn);
      cell.value = source
        ? { formula: `'Monthly Trends'!${sourceCell?.address ?? "A1"}`, result: scalarValue(sourceCell?.value, 0) }
        : 0;
      cell.numFmt = item.format;
      cell.font = { name: "Aptos", bold: true, size: 9, color: { argb: COLORS.ink } };
      cell.alignment = { vertical: "middle", horizontal: "right" };
      cell.fill = solid(summaryRow % 2 === 0 ? COLORS.white : COLORS.surface);
    }
    sheet.getRow(summaryRow).height = 22;
  });

  for (let column = 1; column <= 13; column += 1) {
    const cell = sheet.getCell(11, column);
    cell.fill = solid(COLORS.blueSoft);
    cell.font = { name: "Aptos", bold: true, size: 9, color: { argb: COLORS.navyMid } };
    cell.border = { bottom: { style: "thin", color: { argb: COLORS.blue } } };
    cell.alignment = { vertical: "middle", horizontal: column === 1 ? "left" : "right" };
  }
  sheet.getRow(11).height = 23;

  sheet.addConditionalFormatting({
    ref: "B12:M12",
    rules: [{
      type: "colorScale",
      priority: 1,
      cfvo: [{ type: "min" }, { type: "max" }],
      color: [{ argb: COLORS.white }, { argb: COLORS.blueSoft }],
    }],
  });
  for (const range of ["B13:M13", "B14:M14", "B15:M15"]) {
    sheet.addConditionalFormatting({
      ref: range,
      rules: [
        {
          type: "cellIs",
          priority: 2,
          operator: "lessThan",
          formulae: [0],
          style: { font: { color: { argb: COLORS.red }, bold: true }, fill: solid(COLORS.redSoft) },
        },
        {
          type: "cellIs",
          priority: 3,
          operator: "greaterThan",
          formulae: [-0.0000001],
          style: { font: { color: { argb: COLORS.green }, bold: true }, fill: solid(COLORS.greenSoft) },
        },
      ],
    });
  }

  sheet.mergeCells("A16:M16");
  const note = sheet.getCell("A16");
  note.value = "Earned follows the load month. Collected follows the payment date. Cash after debt shows collected cash after business cash out and debt payments.";
  note.font = { name: "Aptos", italic: true, size: 8, color: { argb: COLORS.muted } };
  note.fill = solid(COLORS.surface);
  note.alignment = { vertical: "middle", wrapText: true };
  sheet.getRow(16).height = 28;
}

function scalarValue(value: ExcelJS.CellValue | undefined, fallback: string | number): string | number {
  if (typeof value === "string" || typeof value === "number") return value;
  if (value && typeof value === "object" && "result" in value) {
    const result = value.result;
    if (typeof result === "string" || typeof result === "number") return result;
  }
  return fallback;
}

function writeWideSummaryPair(
  sheet: ExcelJS.Worksheet,
  row: number,
  left: [string, string | number, "money" | "integer" | "rate"],
  right: [string, string | number, "money" | "integer" | "rate"],
): void {
  sheet.mergeCells(row, 1, row, 2);
  sheet.mergeCells(row, 3, row, 6);
  sheet.mergeCells(row, 7, row, 9);
  sheet.mergeCells(row, 10, row, 13);
  const items = [
    { item: left, labelColumn: 1, valueColumn: 3 },
    { item: right, labelColumn: 7, valueColumn: 10 },
  ];
  for (const { item, labelColumn, valueColumn } of items) {
    const [label, value, format] = item;
    const labelCell = sheet.getCell(row, labelColumn);
    const valueCell = sheet.getCell(row, valueColumn);
    labelCell.value = label;
    valueCell.value = value;
    valueCell.numFmt = format === "money" ? MONEY_FORMAT : format === "rate" ? RATE_FORMAT : INTEGER_FORMAT;
    for (const cell of [labelCell, valueCell]) {
      cell.fill = solid(row % 2 === 0 ? COLORS.surface : COLORS.white);
      cell.border = { bottom: { style: "hair", color: { argb: COLORS.line } } };
      cell.alignment = { vertical: "middle", horizontal: cell === valueCell ? "right" : "left" };
    }
    labelCell.font = { name: "Aptos", size: 10, color: { argb: COLORS.muted } };
    valueCell.font = { name: "Aptos", bold: true, size: 10, color: { argb: Number(value) < 0 ? COLORS.red : COLORS.ink } };
  }
  sheet.getRow(row).height = 23;
}

function mergeCostMixRow(sheet: ExcelJS.Worksheet, row: number): void {
  sheet.mergeCells(row, 1, row, 8);
  sheet.mergeCells(row, 9, row, 11);
  sheet.mergeCells(row, 12, row, 13);
}

function writeSummaryReviewBanner(workbook: ExcelJS.Workbook, sheet: ExcelJS.Worksheet, startRow: number): void {
  const review = workbook.getWorksheet("Review & Checks");
  const actionCount = Number(scalarValue(review?.getCell("A5").value, 0));
  const recordCount = Number(scalarValue(review?.getCell("C5").value, 0));
  const needsReview = actionCount > 0;
  const fill = needsReview ? COLORS.amberSoft : COLORS.greenSoft;
  const accent = needsReview ? COLORS.amber : COLORS.green;

  sheet.mergeCells(startRow, 1, startRow, 9);
  sheet.mergeCells(startRow, 10, startRow + 2, 13);
  sheet.mergeCells(startRow + 1, 1, startRow + 2, 9);
  for (let row = startRow; row <= startRow + 2; row += 1) {
    for (let column = 1; column <= 13; column += 1) {
      const cell = sheet.getCell(row, column);
      cell.fill = solid(fill);
      cell.border = row === startRow
        ? { top: { style: "medium", color: { argb: accent } } }
        : row === startRow + 2
          ? { bottom: { style: "thin", color: { argb: COLORS.line } } }
          : {};
    }
  }
  const headline = sheet.getCell(startRow, 1);
  headline.value = needsReview
    ? `NEEDS REVIEW — ${actionCount} ${actionCount === 1 ? "CHECK" : "CHECKS"} REQUIRE ATTENTION`
    : "READY — NO OPEN DATA ISSUES FOUND";
  headline.font = { name: "Aptos", bold: true, size: 12, color: { argb: accent } };
  headline.alignment = { vertical: "middle" };
  const description = sheet.getCell(startRow + 1, 1);
  description.value = needsReview
    ? `${recordCount} ${recordCount === 1 ? "record may" : "records may"} affect cash, invoicing, fuel reporting or financial classification. Each issue includes a reason and a next action.`
    : "The workbook reconciles and no missing operational data was detected by the export checks.";
  description.font = { name: "Aptos", size: 10, color: { argb: COLORS.ink } };
  description.alignment = { vertical: "middle", wrapText: true };
  const link = sheet.getCell(startRow, 10);
  link.value = { text: "OPEN REVIEW & CHECKS →", hyperlink: "#'Review & Checks'!A1" };
  link.font = { name: "Aptos", bold: true, size: 10, color: { argb: COLORS.blue }, underline: true };
  link.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  sheet.getRow(startRow).height = 25;
  sheet.getRow(startRow + 1).height = 23;
  sheet.getRow(startRow + 2).height = 23;
}

function writeKpiCard(
  sheet: ExcelJS.Worksheet,
  range: string,
  label: string,
  value: number,
  format: DetailKpiFormat,
  accent: string,
  note: string,
): void {
  const [start, end] = range.split(":");
  const startCell = sheet.getCell(start);
  const endCell = sheet.getCell(end);
  const startColumn = sheet.getColumn(startCell.col).number;
  const endColumn = sheet.getColumn(endCell.col).number;
  const startRow = Number(startCell.row);
  const endRow = Number(endCell.row);

  sheet.mergeCells(startRow, startColumn, startRow, endColumn);
  sheet.mergeCells(startRow + 1, startColumn, endRow - 1, endColumn);
  sheet.mergeCells(endRow, startColumn, endRow, endColumn);
  for (let row = startRow; row <= endRow; row += 1) {
    for (let column = startColumn; column <= endColumn; column += 1) {
      const cell = sheet.getCell(row, column);
      cell.fill = solid(COLORS.surface);
      const border: Partial<ExcelJS.Borders> = {};
      if (row === startRow) border.top = { style: "medium", color: { argb: accent } };
      if (row === endRow) border.bottom = { style: "thin", color: { argb: COLORS.line } };
      if (column === startColumn) border.left = { style: "thin", color: { argb: COLORS.line } };
      if (column === endColumn) border.right = { style: "thin", color: { argb: COLORS.line } };
      cell.border = border;
    }
  }
  const labelCell = sheet.getCell(startRow, startColumn);
  labelCell.value = label;
  labelCell.font = { name: "Aptos", bold: true, size: 9, color: { argb: COLORS.muted } };
  labelCell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
  const valueCell = sheet.getCell(startRow + 1, startColumn);
  valueCell.value = value;
  valueCell.numFmt = kpiNumberFormat(format);
  valueCell.font = { name: "Aptos Display", bold: true, size: 20, color: { argb: accent } };
  valueCell.alignment = { horizontal: "left", vertical: "middle" };
  const noteCell = sheet.getCell(endRow, startColumn);
  noteCell.value = note;
  noteCell.font = { name: "Aptos", italic: true, size: 8, color: { argb: COLORS.muted } };
  noteCell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
}

function kpiNumberFormat(format: DetailKpiFormat): string {
  if (format === "money") return MONEY_FORMAT;
  if (format === "rate") return RATE_FORMAT;
  if (format === "percent") return PERCENT_FORMAT;
  if (format === "decimal") return DECIMAL_FORMAT;
  return INTEGER_FORMAT;
}

function writeSectionBand(sheet: ExcelJS.Worksheet, row: number, label: string, lastColumn = "H"): void {
  sheet.mergeCells(`A${row}:${lastColumn}${row}`);
  const cell = sheet.getCell(row, 1);
  cell.value = label;
  cell.font = { name: "Aptos", bold: true, size: 10, color: { argb: COLORS.white } };
  cell.fill = solid(COLORS.navyMid);
  cell.alignment = { vertical: "middle" };
  sheet.getRow(row).height = 24;
}

function styleSmallHeader(row: ExcelJS.Row, columns: number[]): void {
  for (const column of columns) {
    const cell = row.getCell(column);
    cell.fill = solid(COLORS.blueSoft);
    cell.font = { name: "Aptos", bold: true, size: 9, color: { argb: COLORS.navyMid } };
    cell.border = { bottom: { style: "thin", color: { argb: COLORS.blue } } };
    cell.alignment = { vertical: "middle" };
  }
  row.height = 22;
}

function styleSummaryDataRow(sheet: ExcelJS.Worksheet, row: number, from: number, to: number): void {
  for (let column = from; column <= to; column += 1) {
    const cell = sheet.getCell(row, column);
    cell.fill = solid(row % 2 ? COLORS.white : COLORS.surface);
    cell.border = { bottom: { style: "hair", color: { argb: COLORS.line } } };
    cell.font = { name: "Aptos", size: 10, color: { argb: COLORS.ink } };
    cell.alignment = { vertical: "middle", horizontal: typeof cell.value === "number" || column === 5 || column === 7 ? "right" : "left" };
  }
  sheet.getRow(row).height = 22;
}

function styleSummaryTotalRow(sheet: ExcelJS.Worksheet, row: number, from: number, to: number): void {
  styleSummaryDataRow(sheet, row, from, to);
  for (let column = from; column <= to; column += 1) {
    const cell = sheet.getCell(row, column);
    cell.fill = solid(COLORS.greenSoft);
    cell.font = { name: "Aptos", bold: true, size: 10, color: { argb: COLORS.ink } };
    cell.border = { top: { style: "thin", color: { argb: COLORS.green } } };
  }
}

function solid(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}
