import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { fieldErrorsFrom } from "@/lib/actions/types";
import { getMobileSession, requireMobileWrite } from "@/lib/auth/mobile";
import { fuelInPeriod, summarizeFuel, summarizePeriod } from "@/lib/calculations";
import { getRepository } from "@/lib/db";
import { periodFromSearchParams } from "@/lib/period-params";
import { fuelSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fill-ups, and the MPG the odometer actually proves.
 *
 * `summarizeFuel` is the same function `src/app/(app)/fuel/page.tsx` calls,
 * including the rule that cost this app a bug once: MPG is derived per truck
 * from consecutive odometer readings, and stays null until one truck has two
 * of them. The phone must never invent a number the web page would refuse to
 * show -- so `milesPerGallon` is sent as null and the app says why.
 */
export async function GET(request: NextRequest) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const period = periodFromSearchParams(Object.fromEntries(request.nextUrl.searchParams));
  const dataset = await getRepository(session.businessId).getDataset();
  const { loads, expenses, settings, fuelEntries } = dataset;

  const entries = fuelInPeriod(fuelEntries, period);
  const summary = summarizeFuel(entries, summarizePeriod(loads, expenses, period, settings).totalMiles);

  return NextResponse.json(
    {
      periodLabel: period.label,
      summary: {
        totalGallons: summary.totalGallons,
        totalCost: summary.totalCost,
        averagePricePerGallon: summary.averagePricePerGallon,
        fuelCostPerMile: summary.fuelCostPerMile,
        entryCount: summary.entryCount,
        milesPerGallon: summary.milesPerGallon,
        odometerMiles: summary.odometerMiles,
      },
      entries: [...entries]
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .map((entry) => ({
          id: entry.id,
          date: entry.date,
          gallons: entry.gallons,
          pricePerGallon: entry.pricePerGallon,
          totalCost: entry.totalCost,
          odometer: entry.odometer ?? null,
          location: entry.location ?? null,
          jurisdiction: entry.jurisdiction ?? null,
        })),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

/**
 * Record a fill-up. Same `fuelSchema` and same `createFuelEntry` the web form
 * uses -- including the reason the odometer matters: it is the only thing that
 * turns gallons into MPG, and it is a field only the person standing at the
 * pump can fill in.
 */
export async function POST(request: NextRequest) {
  const gate = await requireMobileWrite(request, "manage_fuel");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const parsed = fuelSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) },
      { status: 422 },
    );
  }

  try {
    const entry = await gate.repository.createFuelEntry(parsed.data);
    for (const path of ["/dashboard", "/fuel", "/expenses", "/reports", "/truck"]) revalidatePath(path);
    return NextResponse.json({ id: entry.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save the fuel entry." },
      { status: 400 },
    );
  }
}
