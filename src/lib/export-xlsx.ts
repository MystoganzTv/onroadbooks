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
  if (name.includes("%") || name.includes("margin") || name.includes("deadhead")) return PERCENT_FORMAT;
  if (name.includes("per mile") || name.includes("/mile") || name.includes("price/gallon")) return RATE_FORMAT;
  if (
    name.includes("amount") ||
    name.includes("cost") ||
    name.includes("revenue") ||
    name.includes("profit") ||
    name.includes("gross rate") ||
    name.includes("driver pay") ||
    name.includes("tax due")
  ) return MONEY_FORMAT;
  if (
    name.includes("mile") ||
    name.includes("odometer") ||
    name.includes("weight") ||
    name.includes("length") ||
    name.includes("loads")
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
  tables.forEach((table, index) => {
    writeSheet(workbook, table, sheetNames[index] ?? `Sheet ${index + 1}`, sheetNames);
  });
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
  header.font = { name: "Aptos", bold: true, size: 10, color: { argb: COLORS.white } };
  header.fill = solid(COLORS.navyMid);
  header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  header.height = 32;

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

  setColumnWidths(sheet, table);
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
  if (sheetName === "Expenses") return COLORS.red;
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
      { label: "CASH AFTER DEBT", value: cashAfterDebt, format: "money", accent: cashAfterDebt >= 0 ? COLORS.green : COLORS.red, note: "Collected cash less outflows" },
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

    const statusColumn = table.columns.findIndex((column) => /^(Rating|Payment Status)$/.test(column)) + 1;
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
  const positive = value === "GREAT" || value === "GOOD" || value === "PAID";
  const warning = value === "MARGINAL" || value === "INVOICED" || value === "PENDING";
  cell.font = { name: "Aptos", bold: true, size: 9, color: { argb: positive ? COLORS.green : warning ? COLORS.amber : COLORS.red } };
  cell.fill = solid(positive ? COLORS.greenSoft : warning ? COLORS.amberSoft : COLORS.redSoft);
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

function setColumnWidths(sheet: ExcelJS.Worksheet, table: ReportTable): void {
  table.columns.forEach((header, index) => {
    const column = sheet.getColumn(index + 1);
    const sample = table.rows.slice(0, 250).map((row) => String(row[index] ?? ""));
    const natural = Math.max(header.length + 2, ...sample.map((value) => Math.min(value.length + 2, 44)));
    const lower = header.toLowerCase();
    const numeric = /amount|cost|revenue|profit|rate|mile|gallon|odometer|weight|length|%/.test(lower);
    const date = lower.includes("date");
    const longText = /notes|description|origin|destination|linked load|financial treatment/.test(lower);
    column.width = longText ? Math.min(34, Math.max(18, natural)) : date ? 13 : numeric ? Math.min(16, Math.max(11, natural)) : Math.min(24, Math.max(12, natural));
  });
}

function writeSummarySheet(
  workbook: ExcelJS.Workbook,
  table: ReportTable,
  workbookSheets: string[],
): void {
  const sheet = addWorksheet(workbook, "Summary", "landscape");
  sheet.views = [{ state: "frozen", ySplit: 4, showGridLines: false, zoomScale: 95 }];
  sheet.pageSetup.fitToWidth = 1;

  const entries = new Map(table.rows.map((row) => [String(row[0] ?? "").trim(), row[1]]));
  const value = (label: string): string | number => entries.get(label) ?? 0;
  const business = String(value("Business"));
  const year = String(value("Year"));
  const model = String(value("Calculation model"));
  const generatedDate = reportDate();

  const widths = [3, 21, 16, 3, 21, 16, 3, 23];
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });

  sheet.mergeCells("A1:H2");
  const title = sheet.getCell("A1");
  title.value = `${business}  /  ${year} YEAR-END REPORT`;
  title.font = { name: "Aptos Display", size: 22, bold: true, color: { argb: COLORS.white } };
  title.fill = solid(COLORS.navy);
  title.alignment = { horizontal: "left", vertical: "middle" };
  sheet.getRow(1).height = 28;
  sheet.getRow(2).height = 20;

  sheet.mergeCells("A3:H3");
  const meta = sheet.getCell("A3");
  meta.value = `ONROAD BOOKS  •  PERIOD ${value("Period covered")}  •  MODEL ${model}  •  GENERATED ${generatedDate}`;
  meta.font = { name: "Aptos", bold: true, size: 9, color: { argb: COLORS.muted } };
  meta.fill = solid(COLORS.surface);
  meta.alignment = { vertical: "middle" };
  sheet.getRow(3).height = 23;

  const operatingProfit = Number(value("Operating Profit"));
  const cashAfterDebt = Number(value("Cash After Debt Service"));
  writeKpiCard(sheet, "A5:B8", "BOOKED REVENUE", Number(value("Booked Revenue")), "money", COLORS.blue, "Performance basis");
  writeKpiCard(sheet, "C5:D8", "OPERATING PROFIT", operatingProfit, "money", operatingProfit >= 0 ? COLORS.green : COLORS.red, "After operating costs");
  writeKpiCard(sheet, "E5:F8", "CASH AFTER DEBT", cashAfterDebt, "money", cashAfterDebt >= 0 ? COLORS.green : COLORS.red, "Collected cash basis");
  writeKpiCard(sheet, "G5:H8", "TOTAL MILES", Number(value("Total miles")), "integer", COLORS.navyMid, `${value("Loads recorded")} loads recorded`);

  writeSectionBand(sheet, 10, "FINANCIAL OVERVIEW");
  const financialRows: Array<[string, string | number, "money" | "integer" | "rate"]> = [
    ["Booked Revenue", value("Booked Revenue"), "money"],
    ["Collected Revenue", value("Collected Revenue"), "money"],
    ["Accounts Receivable", value("Accounts Receivable"), "money"],
    ["Operating expenses", value("Operating expenses"), "money"],
    ["Operating Profit", value("Operating Profit"), "money"],
    ["Debt Service", value("Debt Service"), "money"],
    ["Cash After Debt Service", value("Cash After Debt Service"), "money"],
  ];
  writeSummaryTable(sheet, 11, financialRows);

  writeSectionBand(sheet, 17, "OPERATING SNAPSHOT");
  const operations: Array<[string, string | number, "money" | "integer" | "rate"]> = [
    ["Loads recorded", value("Loads recorded"), "integer"],
    ["Loaded miles", value("Loaded miles"), "integer"],
    ["Deadhead miles", value("Deadhead miles"), "integer"],
    ["Total miles", value("Total miles"), "integer"],
    ["Actual Cost per Mile", value("Actual Cost per Mile"), "rate"],
    ["Fuel purchased (gallons)", value("Fuel purchased (gallons)"), "integer"],
  ];
  writeSummaryTable(sheet, 18, operations);

  const categoryRows = table.rows.filter((row) => /^\s{2}\S/.test(String(row[0] ?? "")));
  const costStart = 23;
  writeSectionBand(sheet, costStart, "OPERATING COST MIX");
  mergeSummaryColumns(sheet, costStart + 1);
  sheet.getCell(costStart + 1, 2).value = "Category";
  sheet.getCell(costStart + 1, 5).value = "Amount";
  sheet.getCell(costStart + 1, 7).value = "Share";
  styleSmallHeader(sheet.getRow(costStart + 1), [2, 5, 7]);

  let rowNumber = costStart + 2;
  const costTotal = categoryRows.reduce((sum, row) => sum + Number(row[1] ?? 0), 0);
  for (const category of categoryRows) {
    const amount = Number(category[1] ?? 0);
    mergeSummaryColumns(sheet, rowNumber);
    sheet.getCell(rowNumber, 2).value = String(category[0]).trim();
    sheet.getCell(rowNumber, 5).value = amount;
    sheet.getCell(rowNumber, 5).numFmt = MONEY_FORMAT;
    sheet.getCell(rowNumber, 7).value = { formula: costTotal ? `=E${rowNumber}/$E$${costStart + 2 + categoryRows.length}` : "=0", result: costTotal ? amount / costTotal : 0 };
    sheet.getCell(rowNumber, 7).numFmt = "0.0%";
    styleSummaryDataRow(sheet, rowNumber, 2, 8);
    rowNumber += 1;
  }
  mergeSummaryColumns(sheet, rowNumber);
  sheet.getCell(rowNumber, 2).value = "Total operating cost mix";
  sheet.getCell(rowNumber, 5).value = { formula: `=SUM(E${costStart + 2}:E${rowNumber - 1})`, result: costTotal };
  sheet.getCell(rowNumber, 5).numFmt = MONEY_FORMAT;
  sheet.getCell(rowNumber, 7).value = { formula: categoryRows.length ? `=SUM(G${costStart + 2}:G${rowNumber - 1})` : "=0", result: categoryRows.length ? 1 : 0 };
  sheet.getCell(rowNumber, 7).numFmt = "0.0%";
  styleSummaryTotalRow(sheet, rowNumber, 2, 8);

  const noteRow = rowNumber + 3;
  writeSectionBand(sheet, noteRow, "REPORT NOTES & CONTROLS");
  sheet.mergeCells(`B${noteRow + 1}:H${noteRow + 2}`);
  const note = sheet.getCell(noteRow + 1, 2);
  note.value = String(value("Note"));
  note.font = { name: "Aptos", size: 10, italic: true, color: { argb: COLORS.muted } };
  note.fill = solid(COLORS.surface);
  note.alignment = { vertical: "middle", wrapText: true };

  const navigationRow = noteRow + 4;
  sheet.getCell(navigationRow, 2).value = "WORKBOOK NAVIGATION";
  sheet.getCell(navigationRow, 2).font = { name: "Aptos", bold: true, size: 9, color: { argb: COLORS.navyMid } };
  workbookSheets.filter((sheetName) => sheetName !== "Summary").slice(0, 6).forEach((sheetName, index) => {
    const row = navigationRow + 1 + Math.floor(index / 3);
    const column = 2 + (index % 3) * 2;
    sheet.mergeCells(row, column, row, column + 1);
    const cell = sheet.getCell(row, column);
    cell.value = { text: sheetName, hyperlink: `#'${sheetName.replace(/'/g, "''")}'!A1` };
    cell.font = { name: "Aptos", bold: true, size: 10, color: { argb: COLORS.blue }, underline: true };
  });

  sheet.pageSetup.printArea = `A1:H${navigationRow + 3}`;
  sheet.headerFooter.oddFooter = "OnRoad Books  •  Confidential year-end report  |  &P of &N";
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

function writeSectionBand(sheet: ExcelJS.Worksheet, row: number, label: string): void {
  sheet.mergeCells(`A${row}:H${row}`);
  const cell = sheet.getCell(row, 1);
  cell.value = label;
  cell.font = { name: "Aptos", bold: true, size: 10, color: { argb: COLORS.white } };
  cell.fill = solid(COLORS.navyMid);
  cell.alignment = { vertical: "middle" };
  sheet.getRow(row).height = 24;
}

function writeSummaryTable(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  rows: Array<[string, string | number, "money" | "integer" | "rate"]>,
): void {
  const midpoint = Math.ceil(rows.length / 2);
  rows.forEach(([label, value, format], index) => {
    const side = index < midpoint ? 0 : 3;
    const row = startRow + (index < midpoint ? index : index - midpoint);
    const labelCell = sheet.getCell(row, 2 + side);
    const valueCell = sheet.getCell(row, 3 + side);
    labelCell.value = label;
    valueCell.value = value;
    valueCell.numFmt = format === "money" ? MONEY_FORMAT : format === "rate" ? RATE_FORMAT : INTEGER_FORMAT;
    for (const cell of [labelCell, valueCell]) {
      cell.fill = solid(row % 2 ? COLORS.white : COLORS.surface);
      cell.border = { bottom: { style: "hair", color: { argb: COLORS.line } } };
      cell.alignment = { vertical: "middle", horizontal: cell === valueCell ? "right" : "left" };
    }
    labelCell.font = { name: "Aptos", size: 10, color: { argb: COLORS.muted } };
    const numeric = Number(value);
    valueCell.font = { name: "Aptos", bold: true, size: 10, color: { argb: numeric < 0 ? COLORS.red : COLORS.ink } };
    sheet.getRow(row).height = 22;
  });
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

function mergeSummaryColumns(sheet: ExcelJS.Worksheet, row: number): void {
  sheet.mergeCells(row, 2, row, 4);
  sheet.mergeCells(row, 5, row, 6);
  sheet.mergeCells(row, 7, row, 8);
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
