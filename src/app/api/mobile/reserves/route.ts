import { NextResponse, type NextRequest } from "next/server";

import { getMobileSession } from "@/lib/auth/mobile";
import { getRepository } from "@/lib/db";
import { periodFromSearchParams } from "@/lib/period-params";
import { capabilityRefusal, planAllows } from "@/lib/plans";
import { mobileReserveLedger } from "@/lib/mobile/reserves";
import { roleCan } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Am I saving enough?
 *
 * Reserves are a `cockpit` capability on the web, so they are one here too --
 * a phone is not a way around a plan gate. Balances, rules and safe-to-pay all
 * come from the same `lib/finance` functions `src/app/(app)/reserves/page.tsx`
 * calls, so a rate is applied in exactly one place.
 */
export async function GET(request: NextRequest) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!roleCan(session.role ?? "VIEWER", "manage_owner_finances")) {
    return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  }

  const period = periodFromSearchParams(Object.fromEntries(request.nextUrl.searchParams));
  const dataset = await getRepository(session.businessId).getDataset();
  const { subscription } = dataset;

  if (!planAllows(subscription, "cockpit")) {
    return NextResponse.json({ error: capabilityRefusal("cockpit") }, { status: 403 });
  }

  return NextResponse.json(
    mobileReserveLedger(dataset, period),
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
