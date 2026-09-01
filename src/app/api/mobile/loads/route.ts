import { NextResponse, type NextRequest } from "next/server";

import { getMobileSession } from "@/lib/auth/mobile";
import { getRepository } from "@/lib/db";
import {
  linkedFuelByLoad,
  loadsInPeriod,
  thresholdsFromSettings,
  withMetricsAll,
} from "@/lib/calculations";
import { scoreLoads } from "@/lib/finance";
import { periodFromSearchParams } from "@/lib/period-params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same period params as the web app: ?month=2026-08&period=full */
export async function GET(request: NextRequest) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const period = periodFromSearchParams(Object.fromEntries(request.nextUrl.searchParams));
  const dataset = await getRepository(session.businessId).getDataset();
  const { loads, settings, fuelEntries } = dataset;

  const thresholds = thresholdsFromSettings(settings);
  const scored = scoreLoads(
    withMetricsAll(loadsInPeriod(loads, period), thresholds, linkedFuelByLoad(fuelEntries)),
    thresholds,
    settings.deadheadWarnPct,
  );

  const results = [...scored]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((load) => ({
      id: load.id,
      date: load.date,
      broker: load.broker,
      originCity: load.originCity,
      originState: load.originState,
      destinationCity: load.destinationCity,
      destinationState: load.destinationState,
      grossRate: load.grossRate,
      loadedMiles: load.loadedMiles,
      deadheadMiles: load.deadheadMiles,
      profitPerMile: load.metrics.profitPerMile,
      profitMargin: load.metrics.profitMargin,
      deadheadPct: load.metrics.deadheadPct,
      rating: load.metrics.rating,
    }));

  return NextResponse.json(
    { periodLabel: period.label, loads: results },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
