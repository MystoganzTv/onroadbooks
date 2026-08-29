import type { Metadata } from "next";

import { PeriodControls } from "@/components/dashboard/period-controls";
import { LoadFormDialog } from "@/components/loads/load-form-dialog";
import { LoadsTable } from "@/components/loads/loads-table";
import { MiniStat } from "@/components/dashboard/mini-stat";
import { PageHeader } from "@/components/shared/page-header";
import { TruckSwitcher } from "@/components/fleet/truck-switcher";
import {
  loadsInPeriod,
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
import { defaultEntryDate } from "@/lib/periods";
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
  const { trucks, loads, expenses, settings } = await getRepository(
    session.businessId,
  ).getDataset();
  const period = periodFromSearchParams(params);
  const ratingThresholds = thresholdsFromSettings(settings);

  const scopeTruckId = truckFromSearchParams(params, trucks);
  const scopedLoads = loadsForTruck(loads, scopeTruckId);
  const scopedExpenses = expensesForTruck(expenses, scopeTruckId);

  const periodLoads = withMetricsAll(loadsInPeriod(scopedLoads, period), ratingThresholds);
  const summary = summarizePeriod(scopedLoads, scopedExpenses, period, settings);
  const brokers = [...new Set(loads.map((l) => l.broker).filter(Boolean))].sort() as string[];

  const tripExpenses = periodLoads.reduce((sum, load) => sum + load.metrics.tripExpenses, 0);
  const tripProfit = periodLoads.reduce((sum, load) => sum + load.metrics.tripProfit, 0);

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title="Loads"
        description={`${period.label} - every load dated inside the selected period`}
        actions={<LoadFormDialog
            brokers={brokers}
            trucks={trucks}
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
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
      >
        <MiniStat label="Loads" value={formatNumber(summary.loadCount)} sub="in period" />
        <MiniStat
          label="Gross Revenue"
          value={formatMoneyCompact(summary.grossRevenue)}
          tone="info"
        />
        <MiniStat label="Total Miles" value={formatNumber(summary.totalMiles)} sub="mi" />
        <MiniStat
          label="Deadhead %"
          value={formatPercent(summary.deadheadPct)}
          tone={summary.deadheadPct > (settings.deadheadWarnPct ?? 20) ? "warning" : "positive"}
        />
        <MiniStat
          label="Trip Expenses"
          value={formatMoneyCompact(tripExpenses)}
          tone="negative"
          sub="fuel + tolls + other"
        />
        <MiniStat
          label="Revenue / Mile"
          value={formatRate(summary.revenuePerMile)}
          tone="info"
          sub={`trip profit ${formatMoneyCompact(tripProfit)}`}
        />
      </section>

      <LoadsTable
        loads={periodLoads}
        brokers={brokers}
        trucks={trucks}
        defaultTruckId={scopeTruckId}
        defaultDate={defaultEntryDate(period)}
        ratingThresholds={ratingThresholds}
        emptyDescription={`No loads are dated inside ${period.label}. Try another period or add one.`}
      />
    </div>
  );
}
