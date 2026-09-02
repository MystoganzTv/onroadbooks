import type { Metadata } from "next";

import { PeriodControls } from "@/components/dashboard/period-controls";
import { LoadFormDialog } from "@/components/loads/load-form-dialog";
import { LoadsTable } from "@/components/loads/loads-table";
import { MiniStat } from "@/components/dashboard/mini-stat";
import { PageHeader } from "@/components/shared/page-header";
import { TruckSwitcher } from "@/components/fleet/truck-switcher";
import {
  linkedFuelByLoad,
  isDeadheadElevated,
  loadsInPeriod,
  roundMoney,
  summarizePeriod,
  thresholdsFromSettings,
  withMetricsAll,
} from "@/lib/calculations";
import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { driverScheduleFromLoads } from "@/lib/driver-availability";
import {
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  formatRate,
} from "@/lib/formatters";
import { expensesForTruck, loadsForTruck, orderedTrucks } from "@/lib/fleet";
import { overheadCostPerMile, trailingCostBasis } from "@/lib/finance";
import { defaultEntryDate, todayISO } from "@/lib/periods";
import { hasFleetAccess } from "@/lib/plans";
import { getWebDictionary, interpolate } from "@/lib/i18n/dictionaries";
import { formatLocalePeriod } from "@/lib/i18n-format";
import { getAppLocale } from "@/lib/i18n-server";
import {
  periodFromSearchParams,
  truckFromSearchParams,
  type SearchParams,
} from "@/lib/period-params";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).loads.metadataTitle };
}

export default async function LoadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [params, session, locale] = await Promise.all([searchParams, requireSession(), getAppLocale()]);
  const copy = getWebDictionary(locale).loads;
  const { trucks, loads, expenses, fuelEntries, settings, drivers, subscription, paymentEvents } = await getRepository(
    session.businessId,
  ).getDataset();
  const period = periodFromSearchParams(params);
  const periodLabel = formatLocalePeriod(period, locale);
  const ratingThresholds = thresholdsFromSettings(settings);

  const scopeTruckId = truckFromSearchParams(params, trucks);
  const scopedLoads = loadsForTruck(loads, scopeTruckId);
  const scopedExpenses = expensesForTruck(expenses, scopeTruckId);

  const linkedFuel = linkedFuelByLoad(fuelEntries);
  const periodLoads = withMetricsAll(loadsInPeriod(scopedLoads, period), ratingThresholds, linkedFuel);
  const summary = summarizePeriod(scopedLoads, scopedExpenses, period, settings, paymentEvents);
  const brokers = [...new Set(loads.map((l) => l.broker).filter(Boolean))].sort() as string[];
  const driverSchedule = driverScheduleFromLoads(loads);

  const tripExpenses = periodLoads.reduce((sum, load) => sum + load.metrics.tripExpenses, 0);
  const tripProfit = periodLoads.reduce((sum, load) => sum + load.metrics.tripProfit, 0);
  const costBasis = trailingCostBasis(loads, expenses, settings, todayISO());
  const allocatedOperatingCosts = roundMoney(
    summary.totalMiles * overheadCostPerMile(costBasis),
  );
  const fullyLoadedOperatingProfit = roundMoney(tripProfit - allocatedOperatingCosts);
  const debtCashBurden = roundMoney(summary.totalMiles * costBasis.debtServicePerMile);

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title={copy.title}
        description={interpolate(copy.periodDescription, { period: periodLabel })}
        actions={<LoadFormDialog
            brokers={brokers}
            trucks={trucks}
            drivers={hasFleetAccess(subscription) ? drivers : []}
            defaultTruckId={scopeTruckId}
            defaultDate={defaultEntryDate(period)}
            ratingThresholds={ratingThresholds}
            driverSchedule={driverSchedule}
          />}
      />

      <div className="flex flex-wrap items-center gap-2">
        <PeriodControls period={period} />
        <TruckSwitcher trucks={orderedTrucks(trucks)} selectedId={scopeTruckId} />
      </div>

      <section
        aria-label={copy.summaryLabel}
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
      >
        <MiniStat
          label={copy.loads}
          value={formatNumber(summary.loadCount)}
          sub={copy.inPeriod}
          help={copy.loadCountHelp}
          wrapText
        />
        <MiniStat
          label={copy.bookedRevenue}
          value={formatMoneyCompact(summary.bookedRevenue)}
          tone="info"
          help={copy.bookedRevenueHelp}
          wrapText
        />
        <MiniStat
          label={copy.totalMiles}
          value={formatNumber(summary.totalMiles)}
          sub="mi"
          help={copy.totalMilesHelp}
          wrapText
        />
        <MiniStat
          label={copy.deadheadPercent}
          value={formatPercent(summary.deadheadPct)}
          tone={isDeadheadElevated(summary.deadheadPct, settings.deadheadWarnPct) ? "warning" : "positive"}
          help={copy.deadheadHelp}
          wrapText
        />
        <MiniStat
          label={copy.directTripCosts}
          value={formatMoneyCompact(tripExpenses)}
          tone="negative"
          sub={copy.tripCostsPaidDriver}
          help={copy.directTripCostsHelp}
          wrapText
        />
        <MiniStat
          label={copy.revenuePerMile}
          value={formatRate(summary.revenuePerMile)}
          tone="info"
          sub={interpolate(copy.contributionProfitAmount, { amount: formatMoneyCompact(tripProfit) })}
          help={copy.revenuePerMileHelp}
          wrapText
        />
        <MiniStat
          label={copy.allocatedOperatingCosts}
          value={formatMoneyCompact(allocatedOperatingCosts)}
          tone="negative"
          sub={interpolate(copy.estimate, { basis: costBasis.basisLabel })}
          help={copy.allocatedOperatingCostsHelp}
          wrapText
        />
        <MiniStat
          label={copy.fullyLoadedProfit}
          value={formatMoneyCompact(fullyLoadedOperatingProfit)}
          tone={fullyLoadedOperatingProfit >= 0 ? "positive" : "negative"}
          sub={copy.doesNotChangeRating}
          help={copy.fullyLoadedProfitHelp}
          wrapText
        />
        <MiniStat
          label={copy.debtCashBurden}
          value={formatMoneyCompact(debtCashBurden)}
          tone="warning"
          sub={copy.separateProfitability}
          help={copy.debtCashBurdenHelp}
          wrapText
        />
      </section>

      <LoadsTable
        loads={periodLoads}
        brokers={brokers}
        trucks={trucks}
        drivers={hasFleetAccess(subscription) ? drivers : []}
        driverSchedule={driverSchedule}
        defaultTruckId={scopeTruckId}
        defaultDate={defaultEntryDate(period)}
        ratingThresholds={ratingThresholds}
        deadheadWarnPct={settings.deadheadWarnPct}
        emptyDescription={interpolate(copy.noLoadsPeriod, { period: periodLabel })}
      />
    </div>
  );
}
