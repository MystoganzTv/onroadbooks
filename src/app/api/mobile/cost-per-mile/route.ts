import { NextResponse, type NextRequest } from "next/server";
import { getMobileSession } from "@/lib/auth/mobile";
import { getRepository } from "@/lib/db";
import { mobileScopedDataset } from "@/lib/mobile/scope";
import { calculateTrueCostPerMile, trailingCostBasis } from "@/lib/finance";
import { periodFromSearchParams } from "@/lib/period-params";
import { todayISO } from "@/lib/periods";
import { planAllows } from "@/lib/plans";

export async function GET(request: NextRequest) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dataset = mobileScopedDataset(await getRepository(session.businessId).getDataset(), request.nextUrl.searchParams);
  const period = periodFromSearchParams(Object.fromEntries(request.nextUrl.searchParams));
  const actual = calculateTrueCostPerMile(dataset.loads, dataset.expenses, period, dataset.settings, period.label);
  const trailing = planAllows(dataset.subscription, "cockpit") ? trailingCostBasis(dataset.loads, dataset.expenses, dataset.settings, period.key === "today" ? period.start : todayISO()) : null;
  return NextResponse.json({ periodLabel: period.label, actual, trailing }, { headers: { "Cache-Control": "private, no-store" } });
}
