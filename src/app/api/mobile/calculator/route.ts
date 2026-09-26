import { NextResponse, type NextRequest } from "next/server";

import { getMobileSession } from "@/lib/auth/mobile";
import { getRepository } from "@/lib/db";
import { activeTrucks, orderedTrucks, primaryTruck, truckById } from "@/lib/fleet";
import { calculatorDefaults } from "@/lib/finance/calculator-defaults";
import { capabilityRefusal, planAllows } from "@/lib/plans";
import { todayISO } from "@/lib/periods";
import { truckFromSearchParams } from "@/lib/period-params";
import { FINANCIAL_MODEL_VERSION } from "@/lib/finance/terminology";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same direct-trip inputs and monthly business context as the web calculator. */
export async function GET(request: NextRequest) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataset = await getRepository(session.businessId).getDataset();
  const { subscription, trucks } = dataset;

  if (!planAllows(subscription, "cockpit")) {
    return NextResponse.json({ error: capabilityRefusal("cockpit") }, { status: 403 });
  }

  const today = todayISO();
  const search = Object.fromEntries(request.nextUrl.searchParams.entries());
  const selectableTrucks = orderedTrucks(activeTrucks(trucks));
  const selectedTruck =
    truckById(selectableTrucks, truckFromSearchParams(search, selectableTrucks) ?? "")
    ?? primaryTruck(selectableTrucks.length ? selectableTrucks : trucks);

  return NextResponse.json({
    ...calculatorDefaults(dataset, selectedTruck, today),
    calculationVersion: FINANCIAL_MODEL_VERSION,
    truckName: selectedTruck.name,
    // Compatibility for installed clients. Old allocations are never supplied;
    // the updated app consumes only shared defaults and monthly reference rows.
    overheadPerMile: 0, debtServicePerMile: 0, trueCostPerMile: 0,
    basisLabel: "", basisMiles: 0, basisSufficient: false, debtServiceAvailable: false,
    costCoverage: [], costCoverageComplete: false, sharedOverheadUnallocated: false,
    sharedOverheadPerMile: 0, debtServiceRecorded: false, noFinancingConfirmed: false,
    targetProfitPerMile: 0,
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
