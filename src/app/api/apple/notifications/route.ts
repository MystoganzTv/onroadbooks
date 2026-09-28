import { NextResponse } from "next/server";
import { z } from "zod";
import { appleBillingConfigured, handleAppleNotification } from "@/lib/apple-billing";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  if (!appleBillingConfigured()) return new Response(null, { status: 503 });
  if (Number(request.headers.get("content-length") ?? 0) > 100_000) return new Response(null, { status: 413 });
  const parsed = z.object({ signedPayload: z.string().min(1).max(90_000) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  try { await handleAppleNotification(parsed.data.signedPayload); return NextResponse.json({ received: true }); }
  catch { return new Response(null, { status: 503 }); } // Apple retries; never acknowledge a failed entitlement write.
}
