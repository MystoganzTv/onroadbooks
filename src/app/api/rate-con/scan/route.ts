import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/request-origin";
import { scanRateConfirmation } from "@/lib/rate-con/scan-request";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Cross-origin uploads are refused." }, { status: 403 });
  return scanRateConfirmation(request, session);
}
