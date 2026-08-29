import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { buildReport, reportFileName, REPORT_IDS, toCsv, type ReportId } from "@/lib/export";
import { periodFromSearchParams } from "@/lib/period-params";

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
  const table = buildReport(report as ReportId, dataset, period);
  const csv = toCsv(table);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${reportFileName(report as ReportId, period)}"`,
      "Cache-Control": "no-store",
    },
  });
}
