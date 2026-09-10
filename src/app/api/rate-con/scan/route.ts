import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { canWrite } from "@/lib/plans";
import { extractRateCon, isRateConScanConfigured } from "@/lib/rate-con/extract";
import { isScannableType, MAX_SCAN_BYTES } from "@/lib/rate-con/schema";
import { isSameOriginRequest } from "@/lib/request-origin";
import { roleCan } from "@/lib/roles";

/**
 * POST /api/rate-con/scan
 *
 * Reads a rate confirmation and answers with load-form values. It writes
 * NOTHING: no load, no document, no row of any kind. The file is held in
 * memory for one request and the owner saves the load themselves.
 *
 * A route rather than a server action because reading a scanned PDF takes
 * longer than the platform's default function budget, and `maxDuration`
 * belongs to a route.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function response(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * Best-effort spend guard, per warm instance.
 *
 * Serverless means this is a speed bump, not a quota -- a fresh instance
 * starts with an empty map. It is here to stop a stuck client looping, and it
 * is NOT the durable per-workspace limit this feature will need once it is on
 * a plan. That belongs in the subscription, not in memory.
 */
const SCAN_WINDOW_MS = 60 * 60 * 1000;
const SCANS_PER_WINDOW = 40;
const recentScans = new Map<string, number[]>();

function withinScanLimit(businessId: string): boolean {
  const now = Date.now();
  const seen = (recentScans.get(businessId) ?? []).filter((at) => now - at < SCAN_WINDOW_MS);
  if (seen.length >= SCANS_PER_WINDOW) {
    recentScans.set(businessId, seen);
    return false;
  }
  seen.push(now);
  recentScans.set(businessId, seen);
  return true;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return response({ error: "Not signed in." }, 401);
  if (!isSameOriginRequest(request)) return response({ error: "Cross-origin uploads are refused." }, 403);
  if (!isRateConScanConfigured()) {
    return response({ error: "Rate confirmation scanning is not set up on this deployment." }, 503);
  }
  if (!roleCan(session.role ?? "VIEWER", "manage_loads")) {
    return response({ error: "Your role cannot add loads." }, 403);
  }

  const { subscription } = await getRepository(session.businessId).getDataset();
  if (!canWrite(subscription)) {
    return response({ error: "This workspace is read-only until billing is active." }, 402);
  }
  if (!withinScanLimit(session.businessId)) {
    return response({ error: "That is a lot of scans in one hour. Try again shortly." }, 429);
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return response({ error: "Choose a rate confirmation to scan." }, 400);
  }
  if (!isScannableType(file.type)) {
    return response({ error: "Scanning works on a PDF or a photo (PNG, JPEG or WebP)." }, 415);
  }
  if (file.size > MAX_SCAN_BYTES) {
    return response({ error: "That file is too large to scan. Try a smaller PDF or photo." }, 413);
  }

  const scan = await extractRateCon(Buffer.from(await file.arrayBuffer()), file.type);
  if (!scan.ok) return response({ error: scan.error }, 502);

  return response(scan.reading);
}
