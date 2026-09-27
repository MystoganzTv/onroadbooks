import { NextResponse } from "next/server";
import { getMobileSession } from "@/lib/auth/mobile";
import { scanRateConfirmation } from "@/lib/rate-con/scan-request";
import type { RateConReading } from "@/lib/rate-con/schema";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const response = await scanRateConfirmation(request, session);
  if (!response.ok) return response;
  const reading = await response.json() as RateConReading;
  return NextResponse.json({ values: Object.fromEntries(Object.entries(reading.fields).filter(([, value]) => value != null).map(([key, value]) => [key, String(value)])), missing: reading.missing }, { headers: { "Cache-Control": "private, no-store" } });
}
