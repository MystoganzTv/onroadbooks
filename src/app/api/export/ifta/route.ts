import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import type { ReportTable } from "@/lib/export";
import { toPdf } from "@/lib/export-pdf";
import { toXlsx } from "@/lib/export-xlsx";
import { calculateIftaReport, currentIftaQuarter } from "@/lib/ifta";
import { truckFromSearchParams } from "@/lib/period-params";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const url = new URL(request.url);
  const dataset = await getRepository(session.businessId).getDataset();
  const params = Object.fromEntries(url.searchParams.entries());
  const requested = url.searchParams.get("quarter") ?? currentIftaQuarter();
  const quarter = /^\d{4}-Q[1-4]$/.test(requested) ? requested : currentIftaQuarter();
  const truckId = truckFromSearchParams(params, dataset.trucks);
  const report = calculateIftaReport(dataset, quarter, truckId);
  const table: ReportTable = {
    title: `IFTA - ${quarter}${report.complete ? " - Ready to file" : " - INCOMPLETE DRAFT"}`,
    columns: ["Jurisdiction", "Total Miles", "Non-taxable Miles", "Taxable Miles", "Tax-paid Gallons", "Taxable Gallons", "Net Gallons", "Tax Rate", "Tax Due"],
    rows: [
      ...report.jurisdictions.map((row) => [row.jurisdiction, row.totalMiles, row.nonTaxableMiles, row.taxableMiles, row.taxPaidGallons, row.taxableGallons, row.netTaxableGallons, row.taxRate ?? "MISSING", row.taxDue ?? "MISSING"]),
      [],
      ["TOTAL / STATUS", report.totalFleetMiles, report.unassignedMiles, report.assignedMiles, report.totalGallons, "", "", `MPG ${report.fleetMpg}`, report.netTaxDue ?? "INCOMPLETE"],
    ],
  };
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
  const bytes = format === "pdf" ? await toPdf(table) : await toXlsx(table);
  return new NextResponse(Buffer.from(bytes), { headers: {
    "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="onroad-books-ifta-${quarter}.${format}"`,
    "Cache-Control": "private, no-store",
  } });
}
