import Link from "next/link";
import type { Metadata } from "next";
import { Gauge } from "lucide-react";

import { MiniStat } from "@/components/dashboard/mini-stat";
import { PeriodControls } from "@/components/dashboard/period-controls";
import { FuelFormDialog } from "@/components/fuel/fuel-form-dialog";
import { FuelTable } from "@/components/fuel/fuel-table";
import { LoadFuelEstimates } from "@/components/fuel/load-fuel-estimates";
import { PageHeader } from "@/components/shared/page-header";
import { TruckSwitcher } from "@/components/fleet/truck-switcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  div,
  expensesInPeriod,
  linkedFuelByLoad,
  fuelInPeriod,
  loadsInPeriod,
  summarizeFuel,
  summarizePeriod,
  thresholdsFromSettings,
  withMetricsAll,
} from "@/lib/calculations";
import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import {
  formatGallons,
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  formatPricePerGallon,
  formatRate,
} from "@/lib/formatters";
import { expensesForTruck, loadsForTruck, orderedTrucks } from "@/lib/fleet";
import { defaultEntryDate } from "@/lib/periods";
import {
  periodFromSearchParams,
  truckFromSearchParams,
  type SearchParams,
} from "@/lib/period-params";

export const metadata: Metadata = { title: "Fuel" };

export default async function FuelPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const session = await requireSession();
  const {
    trucks,
    loads: allLoads,
    expenses: allExpenses,
    fuelEntries: allFuel,
    settings,
    paymentEvents,
  } = await getRepository(session.businessId).getDataset();
  const period = periodFromSearchParams(params);
  const ratingThresholds = thresholdsFromSettings(settings);

  // MPG is a fact about one odometer, so scoping matters more here than
  // anywhere else: mixing two trucks' readings produces a meaningless figure.
  const truckId = truckFromSearchParams(params, trucks);
  const loads = loadsForTruck(allLoads, truckId);
  const expenses = expensesForTruck(allExpenses, truckId);
  const fuelEntries = truckId ? allFuel.filter((e) => e.truckId === truckId) : allFuel;

  const summary = summarizePeriod(loads, expenses, period, settings, paymentEvents);
  const periodExpenses = expensesInPeriod(expenses, period);
  const periodFuel = fuelInPeriod(fuelEntries, period);
  const fuel = summarizeFuel(periodFuel, summary.totalMiles);
  const periodLoads = withMetricsAll(
    loadsInPeriod(loads, period),
    ratingThresholds,
    linkedFuelByLoad(allFuel),
  );

  const lastOdometer =
    fuelEntries
      .filter((entry) => typeof entry.odometer === "number")
      .reduce<number | null>(
        (max, entry) => (entry.odometer! > (max ?? 0) ? entry.odometer! : max),
        null,
      ) ?? null;

  const fuelShare =
    summary.operatingExpenses > 0 ? (summary.fuelExpense / summary.operatingExpenses) * 100 : 0;
  const loadFuelEstimates = periodExpenses.filter(
    (expense) => expense.category === "FUEL" && expense.id.startsWith("expload_") && expense.loadId,
  );

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title="Fuel"
        description={`${period.label} - ${fuel.entryCount} detailed ${fuel.entryCount === 1 ? "fill-up" : "fill-ups"} - ${loadFuelEstimates.length} load ${loadFuelEstimates.length === 1 ? "estimate" : "estimates"}`}
        actions={
          <FuelFormDialog
            loads={periodLoads}
            trucks={trucks}
            defaultTruckId={truckId}
            defaultDate={defaultEntryDate(period)}
            lastOdometer={lastOdometer}
          />
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <PeriodControls period={period} />
        <TruckSwitcher trucks={orderedTrucks(trucks)} selectedId={truckId} />
      </div>

      <section
        aria-label="Fuel summary"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      >
        <MiniStat
          label="Fuel Cost"
          value={formatMoneyCompact(summary.fuelExpense)}
          tone="negative"
          sub={`${formatPercent(fuelShare)} of expenses · ${formatMoneyCompact(fuel.totalCost)} detailed`}
        />
        <MiniStat label="Total Gallons" value={formatGallons(fuel.totalGallons)} />
        <MiniStat
          label="Avg Price / Gal"
          value={formatPricePerGallon(fuel.averagePricePerGallon)}
        />
        <MiniStat
          label="Fuel / Mile"
          value={formatRate(div(summary.fuelExpense, summary.totalMiles))}
          tone="warning"
          sub={`${formatNumber(summary.totalMiles)} mi · all fuel costs`}
        />
        <MiniStat
          label="MPG"
          value={fuel.milesPerGallon ? fuel.milesPerGallon.toFixed(1) : "--"}
          tone={fuel.milesPerGallon && fuel.milesPerGallon >= 8.5 ? "positive" : "neutral"}
          sub={
            fuel.odometerMiles
              ? `${formatNumber(fuel.odometerMiles)} odometer mi`
              : "needs 2 odometer readings"
          }
        />
      </section>

      <LoadFuelEstimates
        estimates={loadFuelEstimates}
        loads={periodLoads}
        trucks={trucks}
        lastOdometer={lastOdometer}
      />

      <div>
        <h2 className="text-sm font-semibold">Detailed fuel purchases</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Actual gallons and pump details used for MPG and IFTA.
        </p>
      </div>

      <FuelTable
        entries={periodFuel}
        loads={periodLoads}
        trucks={trucks}
        defaultTruckId={truckId}
        defaultDate={defaultEntryDate(period)}
        lastOdometer={lastOdometer}
        hasLoadEstimates={loadFuelEstimates.length > 0}
      />

      <Card className="border-dashed">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Gauge className="size-3.5 text-muted-foreground" />
            <CardTitle>How MPG is calculated</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-3">
          <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
            Period MPG uses the distance between the first and last odometer readings in the period,
            divided by the gallons purchased after that first fill-up -- the standard tank-to-tank
            method. The <span className="text-foreground">Segment MPG</span> column shows the same
            calculation between each consecutive pair of readings, so a bad tank stands out
            immediately. Entries without an odometer reading still count toward fuel spend but are
            skipped for MPG.
          </p>
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            IFTA reports a different figure on purpose: it divides every mile in the quarter by
            every gallon bought in it, including the tank you were already running on. Expect the
            number on the{" "}
            <Link href="/ifta" className="text-primary underline underline-offset-2">
              IFTA
            </Link>{" "}
            page to be lower until several fill-ups are on record.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
