import { NextResponse, type NextRequest } from "next/server";

import { getMobileSession } from "@/lib/auth/mobile";
import { getRepository } from "@/lib/db";
import { toXlsxWorkbook } from "@/lib/export-xlsx";
import { buildYearEndPacket } from "@/lib/year-end";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The same packet, for the phone — because "send my accountant the year" is a
 * thing you remember on a Sunday, away from a desk, and the share sheet is
 * right there.
 */
export async function GET(request: NextRequest) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataset = await getRepository(session.businessId).getDataset();
  const requested = Number(request.nextUrl.searchParams.get("year"));
  const year = Number.isInteger(requested) && requested >= 2000 && requested <= 2100
    ? requested
    : new Date().getUTCFullYear();

  const packet = buildYearEndPacket(dataset, year, dataset.business.name);
  const body = await toXlsxWorkbook(packet.tables, packet.sheetNames);

  return new NextResponse(Buffer.from(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${packet.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
