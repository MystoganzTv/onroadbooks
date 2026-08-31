import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { buildReport, reportFileName, REPORT_IDS, toCsv, type ExportFormat, type ReportId } from "@/lib/export";
import { toPdf } from "@/lib/export-pdf";
import { toXlsx } from "@/lib/export-xlsx";
import { periodFromSearchParams, truckFromSearchParams } from "@/lib/period-params";
import { truckById } from "@/lib/fleet";

export const runtime = "nodejs";

/**
 * CSV export for the accountant.
 *
 * The period comes from the same query string the UI uses, so whatever is
 * on screen is exactly what downloads:
 *   /api/export/loads?month=2026-08&period=second
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ report: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { report } = await params;
  if (!REPORT_IDS.includes(report as ReportId)) {
    return NextResponse.json({ error: "Unknown report." }, { status: 404 });
  }

  const url = new URL(request.url);
  const searchParams = Object.fromEntries(url.searchParams.entries());
  const period = periodFromSearchParams(searchParams);

  const dataset = await getRepository(session.businessId).getDataset();
  const truckId = truckFromSearchParams(searchParams, dataset.trucks);
  const truck = truckById(dataset.trucks, truckId);
  const table = buildReport(report as ReportId, dataset, period, truckId);
  const requested = url.searchParams.get("format") ?? "csv";
  const format: ExportFormat = requested === "xlsx" || requested === "pdf" ? requested : "csv";
  const body = format === "xlsx" ? await toXlsx(table) : format === "pdf" ? await toPdf(table) : toCsv(table);
  const contentType = format === "xlsx"
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : format === "pdf" ? "application/pdf" : "text/csv; charset=utf-8";

  return new NextResponse(typeof body === "string" ? body : Buffer.from(body), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${reportFileName(report as ReportId, period, truck?.name, format)}"`,
      "Cache-Control": "no-store",
    },
  });
}
