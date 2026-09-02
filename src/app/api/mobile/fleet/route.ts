import { NextResponse, type NextRequest } from "next/server";

import { getMobileSession } from "@/lib/auth/mobile";
import { getRepository } from "@/lib/db";
import { calculateFleetSummary } from "@/lib/finance/fleet";
import { orderedTrucks } from "@/lib/fleet";
import { periodFromSearchParams } from "@/lib/period-params";
import { capabilityRefusal, hasFleetAccess } from "@/lib/plans";
import { FINANCIAL_MODEL_VERSION } from "@/lib/finance/terminology";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Which truck pays.
 *
 * The same `calculateFleetSummary` the web page calls, so the two clients
 * cannot disagree about a unit's contribution. The rule that matters here:
 * a unit is charged ONLY what it caused. Business overhead is reported
 * separately and its per-mile figure is an ALLOCATION, labelled as one — not
 * a cost any single truck incurred.
 */
export async function GET(request: NextRequest) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataset = await getRepository(session.businessId).getDataset();
  if (!hasFleetAccess(dataset.subscription)) {
    return NextResponse.json({ error: capabilityRefusal("fleet") }, { status: 403 });
  }

  const period = periodFromSearchParams(Object.fromEntries(request.nextUrl.searchParams));
  const { trucks, loads, expenses, settings, paymentEvents } = dataset;
  const fleet = calculateFleetSummary(
    orderedTrucks(trucks),
    loads,
    expenses,
    period,
    settings,
    paymentEvents,
  );

  return NextResponse.json(
    {
      calculationVersion: FINANCIAL_MODEL_VERSION,
      periodLabel: period.label,
      revenue: fleet.revenue,
      collectedRevenue: fleet.collectedRevenue,
      directCosts: fleet.directCosts,
      contribution: fleet.contribution,
      overhead: fleet.overhead,
      operatingProfit: fleet.operatingProfit,
      debtService: fleet.debtService,
      cashAfterDebtService: fleet.cashAfterDebtService,
      totalMiles: fleet.totalMiles,
      overheadPerMile: fleet.overheadPerMile,
      fullyLoadedProfitPerMile: fleet.fullyLoadedProfitPerMile,
      units: fleet.units.map((unit) => ({
        truckId: unit.truck.id,
        truckName: unit.truck.name,
        active: unit.truck.active,
        loadCount: unit.loadCount,
        revenue: unit.revenue,
        directCosts: unit.directCosts,
        contribution: unit.contribution,
        debtService: unit.debtService,
        totalMiles: unit.totalMiles,
        deadheadPct: unit.deadheadPct,
        revenuePerMile: unit.revenuePerMile,
        contributionPerMile: unit.contributionPerMile,
        actualCostPerMile: unit.cost.actualCostPerMile,
      })),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
