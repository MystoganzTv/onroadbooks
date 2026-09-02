import { NextResponse, type NextRequest } from "next/server";

import { getMobileSession, requireMobileWrite } from "@/lib/auth/mobile";
import { fuelInPeriod, summarizeFuel, truckLifetime } from "@/lib/calculations";
import { getRepository } from "@/lib/db";
import { orderedTrucks, primaryTruck, truckById } from "@/lib/fleet";
import { thresholdsFrom, upcomingMaintenance } from "@/lib/maintenance";
import { periodFromSearchParams } from "@/lib/period-params";
import { todayISO } from "@/lib/periods";
import { FINANCIAL_MODEL_VERSION } from "@/lib/finance/terminology";
import { truckSchema } from "@/lib/schemas";
import { fieldErrorsFrom } from "@/lib/actions/types";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The unit: what it has earned, what it has cost, and what it needs next. */
export async function GET(request: NextRequest) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const period = periodFromSearchParams(params);
  const dataset = await getRepository(session.businessId).getDataset();

  const trucks = orderedTrucks(dataset.trucks);
  const truck = truckById(dataset.trucks, params.truck) ?? primaryTruck(dataset.trucks);
  if (!truck) {
    return NextResponse.json(
      { error: "Todavía no hay ningún camión registrado." },
      { status: 404 },
    );
  }

  const lifetime = truckLifetime(dataset, truck);
  const fuel = summarizeFuel(
    fuelInPeriod(dataset.fuelEntries, period).filter((entry) => entry.truckId === truck.id),
    lifetime.totalMiles,
  );
  const due = upcomingMaintenance(
    dataset.maintenanceRecords,
    truck,
    todayISO(),
    thresholdsFrom(dataset.settings),
  );

  return NextResponse.json(
    {
      periodLabel: period.label,
      truck: {
        id: truck.id,
        name: truck.name,
        // Whatever identifies it in the yard, without inventing a label for a
        // truck that carries none.
        detail: [truck.year ? String(truck.year) : null, truck.make, truck.model]
          .filter(Boolean)
          .join(" ") || null,
        vin: truck.vin ?? null,
        odometer: truck.currentOdometer,
        // Owner's per-truck IFTA filing decision -- same field the web's
        // Truck form and fleet dialog write, surfaced here so the phone can
        // show and, below, change it. Null = no decision made yet.
        iftaReportingEnabled: truck.iftaReportingEnabled ?? null,
      },
      truckCount: trucks.length,
      lifetime: {
        calculationVersion: FINANCIAL_MODEL_VERSION,
        bookedRevenue: lifetime.bookedRevenue,
        collectedRevenue: lifetime.collectedRevenue,
        accountsReceivable: lifetime.accountsReceivable,
        unallocatedCollectedRevenue: lifetime.unallocatedCollectedRevenue,
        operatingExpenses: lifetime.operatingExpenses,
        operatingProfit: lifetime.operatingProfit,
        debtService: lifetime.debtService,
        cashAfterDebtService: lifetime.cashAfterDebtService,
        actualCostPerMile: lifetime.actualCostPerMile,
        operatingProfitPerMile: lifetime.operatingProfitPerMile,
        // Compatibility aliases for older mobile builds.
        revenue: lifetime.totalRevenue,
        expenses: lifetime.totalExpenses,
        profit: lifetime.lifetimeProfit,
        miles: lifetime.totalMiles,
        costPerMile: lifetime.costPerMile,
        revenuePerMile: lifetime.revenuePerMile,
        profitPerMile: lifetime.profitPerMile,
        loadCount: lifetime.loadCount,
      },
      // Null rather than a number the odometer has not proved — same rule the
      // Fuel screen follows.
      milesPerGallon: fuel.milesPerGallon,
      fuelCostPerMile: fuel.fuelCostPerMile,
      due: due.map((item) => ({
        type: item.type,
        label: item.label,
        status: item.status,
        dueDate: item.record.nextServiceDate ?? null,
        dueOdometer: item.record.nextServiceOdometer ?? null,
        milesRemaining: item.milesRemaining ?? null,
        daysRemaining: item.daysRemaining ?? null,
      })),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
/**
 * Set this truck's per-truck IFTA filing decision from the phone.
 *
 * `truckSchema.updateTruck` is a full replace of the truck row (see
 * `updateTruckByIdAction` in `lib/actions/trucks.ts`) -- fields the web form
 * would have resubmitted unchanged get wiped to null if we don't send them
 * too. So this loads the truck exactly as the web form would have, merges in
 * only `iftaReportingEnabled`, and validates + saves through the same
 * `truckSchema` and `repository.updateTruck` the web action uses. No
 * mobile-only truck-edit logic; this is the one field IFTA needs from a
 * truck screen, not a truck editor.
 */
export async function PATCH(request: NextRequest) {
  const gate = await requireMobileWrite(request, "manage_fleet");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const { truckId, iftaReportingEnabled } = (body ?? {}) as {
    truckId?: unknown;
    iftaReportingEnabled?: unknown;
  };
  if (typeof truckId !== "string" || !truckId) {
    return NextResponse.json({ error: "truckId is required." }, { status: 422 });
  }
  if (iftaReportingEnabled !== null && typeof iftaReportingEnabled !== "boolean") {
    return NextResponse.json(
      { error: "iftaReportingEnabled must be true, false, or null." },
      { status: 422 },
    );
  }

  const dataset = await gate.repository.getDataset();
  const truck = truckById(dataset.trucks, truckId);
  if (!truck) {
    return NextResponse.json({ error: "That truck does not belong to this workspace." }, { status: 404 });
  }

  const parsed = truckSchema.safeParse({
    name: truck.name,
    acquiredOn: truck.acquiredOn,
    year: truck.year,
    make: truck.make,
    model: truck.model,
    vin: truck.vin,
    purchasePrice: truck.purchasePrice,
    monthlyPayment: truck.monthlyPayment,
    monthlyInsurance: truck.monthlyInsurance,
    axleCount: truck.axleCount ?? null,
    registeredGrossWeightLbs: truck.registeredGrossWeightLbs ?? null,
    operatesInMultipleIftaJurisdictions: truck.operatesInMultipleIftaJurisdictions ?? null,
    iftaReportingEnabled,
    startingOdometer: truck.startingOdometer,
    currentOdometer: truck.currentOdometer,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) },
      { status: 422 },
    );
  }

  try {
    await gate.repository.updateTruck(parsed.data, truckId);
    for (const path of ["/truck", "/ifta", "/dashboard"]) revalidatePath(path);
    return NextResponse.json({ id: truckId }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save the truck." },
      { status: 400 },
    );
  }
}
