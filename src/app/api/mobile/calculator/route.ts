import { NextResponse, type NextRequest } from "next/server";

import { getMobileSession } from "@/lib/auth/mobile";
import { div, summarizeFuel, thresholdsFromSettings } from "@/lib/calculations";
import { getRepository } from "@/lib/db";
import { overheadCostPerMile, trailingCostBasis } from "@/lib/finance/cost-per-mile";
import { capabilityRefusal, planAllows } from "@/lib/plans";
import { todayISO } from "@/lib/periods";
import { FINANCIAL_MODEL_VERSION } from "@/lib/finance/terminology";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What the Load Calculator should start from: this truck's numbers, not a
 * plausible average.
 *
 * Every field here is the same expression `src/app/(app)/calculator/page.tsx`
 * builds its `CalculatorDefaults` from. The phone was shipping hardcoded
 * guesses — 6.5 MPG, $3.85 diesel, $0.85/mi overhead — which produced a
 * confident verdict about somebody else's truck.
 *
 * `overheadCostPerMile` is deliberately NOT Actual Cost Per Mile: fuel, tolls,
 * dispatch and factoring are entered explicitly in the calculator, so a rate
 * that still contained them would charge them twice. That is the classic way a
 * load calculator lies.
 *
 * `basisSufficient` is the honest part. When there are not enough recorded
 * miles behind the overhead, the app has to say so rather than quietly costing
 * a load against thin data.
 */
export async function GET(request: NextRequest) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataset = await getRepository(session.businessId).getDataset();
  const { loads, expenses, settings, goals, fuelEntries, subscription } = dataset;

  if (!planAllows(subscription, "cockpit")) {
    return NextResponse.json({ error: capabilityRefusal("cockpit") }, { status: 403 });
  }

  const basis = trailingCostBasis(loads, expenses, settings, todayISO());
  const fuel = summarizeFuel(fuelEntries, basis.totalMiles);

  const grossRevenue = loads.reduce((total, load) => total + load.grossRate, 0);
  const dispatchPaid = loads.reduce((total, load) => total + load.dispatchFee, 0);
  const factoringPaid = loads.reduce((total, load) => total + load.factoringFee, 0);
  const latestFuel = [...fuelEntries].sort((a, b) => b.date.localeCompare(a.date))[0];

  return NextResponse.json(
    {
      calculationVersion: FINANCIAL_MODEL_VERSION,
      // Null rather than a number nobody proved: the app leaves the field
      // empty and refuses to estimate instead of assuming a fleet average.
      fuelPrice: latestFuel?.pricePerGallon ?? fuel.averagePricePerGallon ?? null,
      mpg: fuel.milesPerGallon ?? null,
      dispatchPct: Math.round(div(dispatchPaid, grossRevenue) * 1000) / 10,
      factoringPct: Math.round(div(factoringPaid, grossRevenue) * 1000) / 10,
      overheadPerMile: overheadCostPerMile(basis),
      debtServicePerMile: basis.debtServicePerMile,
      trueCostPerMile: basis.trueCostPerMile,
      basisLabel: basis.basisLabel,
      basisMiles: basis.totalMiles,
      basisSufficient: basis.sufficient,
      targetProfitPerMile: goals.targetProfitPerMile,
      deadheadWarnPct: settings.deadheadWarnPct,
      thresholds: thresholdsFromSettings(settings),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
