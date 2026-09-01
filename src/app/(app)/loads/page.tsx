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
import {
  periodFromSearchParams,
  truckFromSearchParams,
  type SearchParams,
} from "@/lib/period-params";

export const metadata: Metadata = { title: "Loads" };

export default async function LoadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const session = await requireSession();
  const { trucks, loads, expenses, fuelEntries, settings, drivers, subscription, paymentEvents } = await getRepository(
    session.businessId,
  ).getDataset();
  const period = periodFromSearchParams(params);
  const ratingThresholds = thresholdsFromSettings(settings);

  const scopeTruckId = truckFromSearchParams(params, trucks);
  const scopedLoads = loadsForTruck(loads, scopeTruckId);
  const scopedExpenses = expensesForTruck(expenses, scopeTruckId);

  const linkedFuel = linkedFuelByLoad(fuelEntries);
  const periodLoads = withMetricsAll(loadsInPeriod(scopedLoads, period), ratingThresholds, linkedFuel);
  const summary = summarizePeriod(scopedLoads, scopedExpenses, period, settings, paymentEvents);
  const brokers = [...new Set(loads.map((l) => l.broker).filter(Boolean))].sort() as string[];

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
        title="Loads"
        description={`${period.label} - every load dated inside the selected period`}
        actions={<LoadFormDialog
            brokers={brokers}
            trucks={trucks}
            drivers={hasFleetAccess(subscription) ? drivers : []}
            defaultTruckId={scopeTruckId}
            defaultDate={defaultEntryDate(period)}
            ratingThresholds={ratingThresholds}
          />}
      />

      <div className="flex flex-wrap items-center gap-2">
        <PeriodControls period={period} />
        <TruckSwitcher trucks={orderedTrucks(trucks)} selectedId={scopeTruckId} />
      </div>

      <section
        aria-label="Load summary"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-9"
      >
        <MiniStat label="Loads" value={formatNumber(summary.loadCount)} sub="in period" />
        <MiniStat
          label="Booked Revenue"
          value={formatMoneyCompact(summary.bookedRevenue)}
          tone="info"
        />
        <MiniStat label="Total Miles" value={formatNumber(summary.totalMiles)} sub="mi" />
        <MiniStat
          label="Deadhead %"
          value={formatPercent(summary.deadheadPct)}
          tone={isDeadheadElevated(summary.deadheadPct, settings.deadheadWarnPct) ? "warning" : "positive"}
        />
        <MiniStat
          label="Direct Trip Costs"
          value={formatMoneyCompact(tripExpenses)}
          tone="negative"
          sub="trip costs + paid driver"
        />
        <MiniStat
          label="Revenue / Mile"
          value={formatRate(summary.revenuePerMile)}
          tone="info"
          sub={`Contribution Profit ${formatMoneyCompact(tripProfit)}`}
        />
        <MiniStat
          label="Allocated Operating Costs"
          value={formatMoneyCompact(allocatedOperatingCosts)}
          tone="negative"
          sub={`${costBasis.basisLabel} estimate`}
        />
        <MiniStat
          label="Est. Fully Loaded Operating Profit"
          value={formatMoneyCompact(fullyLoadedOperatingProfit)}
          tone={fullyLoadedOperatingProfit >= 0 ? "positive" : "negative"}
          sub="does not change rating"
        />
        <MiniStat
          label="Debt Cash Burden"
          value={formatMoneyCompact(debtCashBurden)}
          tone="warning"
          sub="separate from profitability"
        />
      </section>

      <LoadsTable
        loads={periodLoads}
        brokers={brokers}
        trucks={trucks}
        drivers={hasFleetAccess(subscription) ? drivers : []}
        defaultTruckId={scopeTruckId}
        defaultDate={defaultEntryDate(period)}
        ratingThresholds={ratingThresholds}
        deadheadWarnPct={settings.deadheadWarnPct}
        emptyDescription={`No loads are dated inside ${period.label}. Try another period or add one.`}
      />
    </div>
  );
}
