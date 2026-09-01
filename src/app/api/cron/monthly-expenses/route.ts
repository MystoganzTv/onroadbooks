import { NextResponse } from "next/server";

import { postDueRecurringExpenses } from "@/lib/jobs/post-recurring-expenses";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Enough headroom to walk every workspace on a slow cold start.
export const maxDuration = 60;

/**
 * The nightly posting of monthly fixed costs.
 *
 * Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`. Without
 * the secret configured the endpoint refuses to run at all rather than
 * defaulting to open: this route writes to every customer's ledger, so an
 * unauthenticated caller must never be able to trigger it.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const result = await postDueRecurringExpenses();
  console.info("[cron:monthly-expenses]", result);

  return NextResponse.json(result, {
    // A failure inside one workspace is reported, not thrown: the run still
    // did its job everywhere else, and a 500 would make Vercel retry the lot.
    status: 200,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
