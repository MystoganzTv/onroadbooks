import type { Metadata } from "next";

import { MiniStat } from "@/components/dashboard/mini-stat";
import { PeriodControls } from "@/components/dashboard/period-controls";
import { FuelFormDialog } from "@/components/fuel/fuel-form-dialog";
import { FuelTable } from "@/components/fuel/fuel-table";
import { FuelExpensesWithoutDetails } from "@/components/fuel/fuel-expenses-without-details";
import { fuelExpensesWithoutEntries } from "@/lib/fuel-expenses";
import { ViewModeToggle } from "@/components/shared/view-mode";
import { getViewMode } from "@/lib/view-mode-server";
import { PageHeader } from "@/components/shared/page-header";
import { TruckSwitcher } from "@/components/fleet/truck-switcher";
import {
  expensesInPeriod,
  fuelInPeriod,
  summarizeFuel,
  summarizePeriod,
} from "@/lib/calculations";
import { requireSession } from "@/lib/auth";
import { getDataset } from "@/lib/db";
import {
  formatGallons,
  formatMoneyCompact,
  formatPercent,
  formatPricePerGallon,
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
  const [params, session, locale, mode] = await Promise.all([searchParams, requireSession(), getAppLocale(), getViewMode()]);
  const simple = mode === "simple";
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

  const truckId = truckFromSearchParams(params, trucks);
  const loads = loadsForTruck(allLoads, truckId);
  const expenses = expensesForTruck(allExpenses, truckId);
  const fuelEntries = truckId ? allFuel.filter((e) => e.truckId === truckId) : allFuel;

  const summary = summarizePeriod(loads, expenses, period, settings, paymentEvents);
  const periodExpenses = expensesInPeriod(expenses, period);
  const periodFuel = fuelInPeriod(fuelEntries, period);
  const fuel = summarizeFuel(periodFuel, summary.totalMiles);
  const lastOdometer =
    fuelEntries
      .filter((entry) => typeof entry.odometer === "number")
      .reduce<number | null>(
        (max, entry) => (entry.odometer! > (max ?? 0) ? entry.odometer! : max),
        null,
      ) ?? null;

  const fuelShare =
    summary.operatingExpenses > 0 ? (summary.fuelExpense / summary.operatingExpenses) * 100 : 0;
  const expensesWithoutDetails = fuelExpensesWithoutEntries(periodExpenses, allFuel);

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title={copy.title}
        description={interpolate(copy.periodSummary, { period: period.label, fills: fuel.entryCount, fillUnit: fuel.entryCount === 1 ? copy.fillUp : copy.fillUps })}
        actions={
          <FuelFormDialog
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
        <div className="sm:ml-auto"><ViewModeToggle /></div>
      </div>

      <section
        aria-label={copy.summaryLabel}
        className={simple ? "grid grid-cols-2 gap-3" : "grid grid-cols-2 gap-3 lg:grid-cols-3"}
      >
        <MiniStat
          label={copy.fuelCost}
          value={formatMoneyCompact(summary.fuelExpense)}
          tone="negative"
          sub={interpolate(copy.expenseShare, { share: formatPercent(fuelShare), detailed: formatMoneyCompact(fuel.totalCost) })}
        />
        <MiniStat label={copy.totalGallons} value={formatGallons(fuel.totalGallons)} />
        {!simple ? <MiniStat
          label={copy.averagePrice}
          value={formatPricePerGallon(fuel.averagePricePerGallon)}
        /> : null}
      </section>

      <FuelExpensesWithoutDetails expenses={expensesWithoutDetails} trucks={trucks} />

      <div>
        <h2 className="text-sm font-semibold">{copy.detailedPurchases}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {copy.detailedDescription}
        </p>
      </div>

      <FuelTable
        entries={periodFuel}
        trucks={trucks}
        defaultTruckId={truckId}
        defaultDate={defaultEntryDate(period)}
        lastOdometer={lastOdometer}
      />
    </div>
  );
}
