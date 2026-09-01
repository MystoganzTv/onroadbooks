import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { toXlsxWorkbook } from "@/lib/export-xlsx";
import { buildYearEndPacket } from "@/lib/year-end";

export const runtime = "nodejs";

/** One workbook for the accountant: /api/export/year-end?year=2026 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const dataset = await getRepository(session.businessId).getDataset();
  const requested = Number(new URL(request.url).searchParams.get("year"));
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
