import { NextResponse, type NextRequest } from "next/server";

import { getMobileSession } from "@/lib/auth/mobile";
import { getRepository } from "@/lib/db";
import {
  buildReport,
  REPORT_IDS,
  reportFileName,
  toCsv,
  type ExportFormat,
  type ReportId,
} from "@/lib/export";
import { toPdf } from "@/lib/export-pdf";
import { toXlsx } from "@/lib/export-xlsx";
import { truckById } from "@/lib/fleet";
import { periodFromSearchParams, truckFromSearchParams } from "@/lib/period-params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One report, two ways out.
 *
 * Without `format`, the table comes back as JSON so the phone can show it —
 * a driver checking a number does not want a download. With `format=pdf|xlsx|csv`
 * the same table is rendered by the same renderers `/api/export/[report]` uses
 * and comes back as a file, for the moment the report is not being read but
 * sent to an accountant.
 *
 * `buildReport` defines each report once as columns plus rows, which is why
 * both paths exist here without a second implementation of anything.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ report: string }> },
) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { report } = await params;
  if (!REPORT_IDS.includes(report as ReportId)) {
    return NextResponse.json({ error: "Unknown report." }, { status: 404 });
  }

  const search = Object.fromEntries(request.nextUrl.searchParams.entries());
  const period = periodFromSearchParams(search);
  const dataset = await getRepository(session.businessId).getDataset();
  const truckId = truckFromSearchParams(search, dataset.trucks);
  const truck = truckById(dataset.trucks, truckId);
  const table = buildReport(report as ReportId, dataset, period, truckId);

  const requested = request.nextUrl.searchParams.get("format");
  if (!requested) {
    return NextResponse.json(
      { periodLabel: period.label, table },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  const format: ExportFormat =
    requested === "xlsx" || requested === "pdf" ? requested : "csv";
  const body =
    format === "xlsx" ? await toXlsx(table) : format === "pdf" ? await toPdf(table) : toCsv(table);
  const contentType =
    format === "xlsx"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : format === "pdf"
        ? "application/pdf"
        : "text/csv; charset=utf-8";

  return new NextResponse(typeof body === "string" ? body : Buffer.from(body), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${reportFileName(report as ReportId, period, truck?.name, format)}"`,
      "Cache-Control": "no-store",
    },
  });
}
