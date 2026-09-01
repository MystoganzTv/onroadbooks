import { NextResponse, type NextRequest } from "next/server";

import { getMobileSession } from "@/lib/auth/mobile";
import { REPORTS } from "@/lib/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What can be exported. Served rather than hardcoded, so a report added to
 *  `lib/export.ts` appears on the phone with no new build. */
export async function GET(request: NextRequest) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(
    { reports: REPORTS },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
