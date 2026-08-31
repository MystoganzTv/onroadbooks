import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ReportTable } from "./export";
import type { Business, Load } from "./types";

const navy = rgb(0.09, 0.2, 0.3);
const blue = rgb(0.18, 0.36, 0.48);
const muted = rgb(0.35, 0.4, 0.45);
const line = rgb(0.84, 0.88, 0.91);

function printable(value: string | number | undefined | null): string {
  return String(value ?? "").replace(/[\r\n]+/g, " ").replace(/[^\x20-\x7E]/g, "-");
}

function fit(text: string, font: PDFFont, size: number, width: number): string {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let value = text;
  while (value.length > 1 && font.widthOfTextAtSize(`${value}...`, size) > width) value = value.slice(0, -1);
  return `${value}...`;
}

function footer(page: PDFPage, font: PDFFont, pageNumber: number) {
  page.drawText(`Onroad Books  |  Page ${pageNumber}`, { x: 28, y: 18, size: 7, font, color: muted });
}

/** Paginated table PDF. Wide tables are split into readable column bands. */
export async function toPdf(table: ReportTable): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const landscape = table.columns.length > 6;
  const size: [number, number] = landscape ? [841.89, 595.28] : [595.28, 841.89];
  const maxColumns = landscape ? 6 : 4;
  const bands: number[][] = [];
  for (let start = 0; start < table.columns.length; start += maxColumns) {
    const columns = Array.from({ length: Math.min(maxColumns, table.columns.length - start) }, (_, index) => start + index);
    if (start > 0 && !columns.includes(0)) columns.unshift(0);
    bands.push(columns);
  }
  let pageNumber = 0;
  for (let bandIndex = 0; bandIndex < bands.length; bandIndex += 1) {
    const indices = bands[bandIndex];
    let page: PDFPage;
    let y = 0;
    const addPage = () => {
      page = doc.addPage(size); pageNumber += 1; y = size[1] - 32;
      page.drawText(printable(table.title), { x: 28, y, size: 15, font: bold, color: navy }); y -= 18;
      if (bands.length > 1) { page.drawText(`Columns ${bandIndex + 1} of ${bands.length}`, { x: 28, y, size: 8, font, color: muted }); y -= 14; }
      const width = (size[0] - 56) / indices.length;
      page.drawRectangle({ x: 28, y: y - 19, width: size[0] - 56, height: 22, color: blue });
      indices.forEach((index, position) => page.drawText(fit(printable(table.columns[index]), bold, 7, width - 6), { x: 31 + position * width, y: y - 12, size: 7, font: bold, color: rgb(1, 1, 1) }));
      y -= 23; footer(page, font, pageNumber);
    };
    addPage();
    const width = (size[0] - 56) / indices.length;
    for (const row of table.rows) {
      if (y < 42) addPage();
      page!.drawLine({ start: { x: 28, y: y - 3 }, end: { x: size[0] - 28, y: y - 3 }, thickness: 0.35, color: line });
      indices.forEach((index, position) => page!.drawText(fit(printable(row[index]), font, 7, width - 6), { x: 31 + position * width, y: y - 12, size: 7, font, color: navy }));
      y -= 18;
    }
  }
  return doc.save();
}

export async function invoicePdf(business: Business, load: Load): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({ x: 0, y: 700, width: 612, height: 92, color: navy });
  page.drawText(printable(business.name), { x: 42, y: 748, size: 19, font: bold, color: rgb(1, 1, 1) });
  page.drawText("FREIGHT INVOICE", { x: 405, y: 748, size: 14, font: bold, color: rgb(1, 1, 1) });
  page.drawText(printable(load.invoiceNumber), { x: 405, y: 726, size: 10, font, color: rgb(0.85, 0.91, 0.95) });
  page.drawText("BILL TO", { x: 42, y: 665, size: 9, font: bold, color: blue });
  page.drawText(printable(load.billToName), { x: 42, y: 647, size: 12, font: bold, color: navy });
  let billY = 631;
  for (const value of [load.billToAddress, load.billToEmail].filter(Boolean)) {
    for (const part of String(value).split(/\r?\n/).slice(0, 4)) { page.drawText(fit(printable(part), font, 9, 265), { x: 42, y: billY, size: 9, font, color: muted }); billY -= 13; }
  }
  const meta: [string, string | null][] = [["Invoice date", load.invoiceDate], ["Due date", load.invoiceDueDate], ["Load number", load.loadNumber ?? "-"]];
  meta.forEach(([label, value], index) => { const y = 665 - index * 24; page.drawText(label, { x: 390, y, size: 8, font, color: muted }); page.drawText(printable(value), { x: 475, y, size: 9, font: bold, color: navy }); });
  page.drawRectangle({ x: 42, y: 532, width: 528, height: 26, color: blue });
  page.drawText("DESCRIPTION", { x: 50, y: 542, size: 8, font: bold, color: rgb(1, 1, 1) });
  page.drawText("AMOUNT", { x: 495, y: 542, size: 8, font: bold, color: rgb(1, 1, 1) });
  const lane = `${load.originCity}, ${load.originState} to ${load.destinationCity}, ${load.destinationState}`;
  page.drawText(fit(printable(lane), bold, 10, 395), { x: 50, y: 504, size: 10, font: bold, color: navy });
  page.drawText(`${(load.loadedMiles + load.deadheadMiles).toLocaleString("en-US")} total miles${load.broker ? ` | ${printable(load.broker)}` : ""}`, { x: 50, y: 486, size: 8, font, color: muted });
  page.drawText(`$${load.grossRate.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, { x: 485, y: 504, size: 10, font: bold, color: navy });
  page.drawLine({ start: { x: 42, y: 468 }, end: { x: 570, y: 468 }, thickness: 0.8, color: line });
  page.drawText("TOTAL DUE", { x: 392, y: 428, size: 10, font: bold, color: muted });
  page.drawText(`$${load.grossRate.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, { x: 480, y: 426, size: 14, font: bold, color: navy });
  if (load.invoiceNotes) { page.drawText("NOTES", { x: 42, y: 390, size: 9, font: bold, color: blue }); page.drawText(fit(printable(load.invoiceNotes), font, 9, 520), { x: 42, y: 372, size: 9, font, color: muted }); }
  page.drawText("Thank you for your business.", { x: 42, y: 64, size: 9, font: bold, color: navy });
  footer(page, font, 1);
  return doc.save();
}
