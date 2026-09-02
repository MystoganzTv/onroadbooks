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
import { getDataset } from "@/lib/db";
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
import { getAppLocale } from "@/lib/i18n-server";
import { getWebDictionary, interpolate } from "@/lib/i18n/dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).fuel.metadataTitle };
}

export default async function FuelPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [params, session, locale] = await Promise.all([searchParams, requireSession(), getAppLocale()]);
  const copy = getWebDictionary(locale).fuel;
  const {
    trucks,
    loads: allLoads,
    expenses: allExpenses,
    fuelEntries: allFuel,
    settings,
    paymentEvents,
  } = await getDataset(session.businessId);
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
        title={copy.title}
        description={interpolate(copy.periodSummary, { period: period.label, fills: fuel.entryCount, fillUnit: fuel.entryCount === 1 ? copy.fillUp : copy.fillUps, estimates: loadFuelEstimates.length, estimateUnit: loadFuelEstimates.length === 1 ? copy.estimate : copy.estimates })}
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
        aria-label={copy.summaryLabel}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      >
        <MiniStat
          label={copy.fuelCost}
          value={formatMoneyCompact(summary.fuelExpense)}
          tone="negative"
          sub={interpolate(copy.expenseShare, { share: formatPercent(fuelShare), detailed: formatMoneyCompact(fuel.totalCost) })}
        />
        <MiniStat label={copy.totalGallons} value={formatGallons(fuel.totalGallons)} />
        <MiniStat
          label={copy.averagePrice}
          value={formatPricePerGallon(fuel.averagePricePerGallon)}
        />
        <MiniStat
          label={copy.fuelPerMile}
          value={formatRate(div(summary.fuelExpense, summary.totalMiles))}
          tone="warning"
          sub={interpolate(copy.allFuelCosts, { miles: formatNumber(summary.totalMiles) })}
        />
        <MiniStat
          label="MPG"
          value={fuel.milesPerGallon ? fuel.milesPerGallon.toFixed(1) : "--"}
          tone={fuel.milesPerGallon && fuel.milesPerGallon >= 8.5 ? "positive" : "neutral"}
          sub={
            fuel.odometerMiles
              ? interpolate(copy.odometerMiles, { miles: formatNumber(fuel.odometerMiles) })
              : copy.needsReadings
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
        <h2 className="text-sm font-semibold">{copy.detailedPurchases}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {copy.detailedDescription}
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
            <CardTitle>{copy.mpgTitle}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-3">
          <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
            {copy.mpgDescription}
          </p>
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            {copy.iftaDifference}{" "}
            <Link href="/ifta" className="text-primary underline underline-offset-2">
              IFTA
            </Link>{" "}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
