import { NextResponse } from "next/server";

import { buildHealthReport } from "@/lib/operational-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const report = await buildHealthReport();
  return NextResponse.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
