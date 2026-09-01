import { NextResponse, type NextRequest } from "next/server";

import { getMobileSession } from "@/lib/auth/mobile";
import { fuelInPeriod, summarizeFuel, truckLifetime } from "@/lib/calculations";
import { getRepository } from "@/lib/db";
import { orderedTrucks, primaryTruck, truckById } from "@/lib/fleet";
import { thresholdsFrom, upcomingMaintenance } from "@/lib/maintenance";
import { periodFromSearchParams } from "@/lib/period-params";
import { todayISO } from "@/lib/periods";
import { FINANCIAL_MODEL_VERSION } from "@/lib/finance/terminology";

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
