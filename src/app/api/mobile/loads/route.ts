import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { fieldErrorsFrom } from "@/lib/actions/types";
import { getMobileSession, requireMobileWrite } from "@/lib/auth/mobile";
import { loadSchema } from "@/lib/schemas";
import { getRepository } from "@/lib/db";
import {
  linkedFuelByLoad,
  loadsInPeriod,
  thresholdsFromSettings,
  withMetricsAll,
} from "@/lib/calculations";
import { scoreLoads } from "@/lib/finance";
import { periodFromSearchParams } from "@/lib/period-params";
import { FINANCIAL_MODEL_VERSION } from "@/lib/finance/terminology";

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
      directTripCosts: load.metrics.tripExpenses,
      contributionProfit: load.metrics.tripProfit,
      contributionProfitPerMile: load.metrics.profitPerMile,
      contributionMargin: load.metrics.profitMargin,
      // Read-compatible aliases for older mobile builds.
      profitPerMile: load.metrics.profitPerMile,
      profitMargin: load.metrics.profitMargin,
      deadheadPct: load.metrics.deadheadPct,
      rating: load.metrics.rating,
    }));

  return NextResponse.json(
    { calculationVersion: FINANCIAL_MODEL_VERSION, periodLabel: period.label, loads: results },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

/**
 * Record a load from the phone.
 *
 * The body is the same shape the web form posts and is validated by the same
 * `loadSchema`, so the refusals a browser would get -- delivery before pickup,
 * trip costs implausible against the rate, jurisdiction miles over trip miles
 * -- are the refusals a truck stop gets. There is no mobile-only validation
 * and no mobile-only write path: this calls `createLoad` exactly as the
 * server action does.
 */
export async function POST(request: NextRequest) {
  const gate = await requireMobileWrite(request, "manage_loads");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const parsed = loadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) },
      { status: 422 },
    );
  }

  try {
    const load = await gate.repository.createLoad(parsed.data);
    for (const path of ["/dashboard", "/loads", "/reports", "/truck"]) revalidatePath(path);
    return NextResponse.json({ id: load.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save the load." },
      { status: 400 },
    );
  }
}
