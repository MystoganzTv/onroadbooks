import type { Metadata } from "next";
import {
  Banknote,
  Gauge,
  Percent,
  Route,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { RevenueExpenseChart } from "@/components/charts/revenue-expense-chart";
import { DeadheadCard } from "@/components/dashboard/deadhead-card";
import { InsightsCard } from "@/components/dashboard/insights-card";
import { LoadQualityCard } from "@/components/dashboard/load-quality-card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { MiniStat } from "@/components/dashboard/mini-stat";
import { MoneyBreakdownCard } from "@/components/dashboard/money-breakdown-card";
import { PeriodControls } from "@/components/dashboard/period-controls";
import { RecentLoads } from "@/components/dashboard/recent-loads";
import { ExpenseFormDialog } from "@/components/expenses/expense-form-dialog";
import { LoadFormDialog } from "@/components/loads/load-form-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  analyzeDeadhead,
  brokerPerformance,
  buildInsights,
  categoryTotals,
  ratingBreakdown,
  expensesInPeriod,
  fuelInPeriod,
  loadsInPeriod,
  moneyBreakdown,
  pctChange,
  summarizeFuel,
  summarizePeriod,
  thresholdsFromSettings,
  withMetricsAll,
} from "@/lib/calculations";
import { periodBuckets } from "@/lib/chart-data";
import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import {
  formatMiles,
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  formatRate,
} from "@/lib/formatters";
import { periodFromSearchParams, periodQuery, type SearchParams } from "@/lib/period-params";
import { defaultEntryDate, previousPeriod } from "@/lib/periods";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const session = await requireSession();
  const dataset = await getRepository(session.businessId).getDataset();
  const period = periodFromSearchParams(params);
  const prior = previousPeriod(period);

  const { loads, expenses, fuelEntries, settings } = dataset;
  const ratingThresholds = thresholdsFromSettings(settings);

  const summary = summarizePeriod(loads, expenses, period, settings);
  const priorSummary = summarizePeriod(loads, expenses, prior, settings);
  const breakdown = moneyBreakdown(summary, settings);

  const periodLoads = withMetricsAll(loadsInPeriod(loads, period), ratingThresholds);
  const periodExpenses = expensesInPeriod(expenses, period);
  const categories = categoryTotals(periodExpenses, settings);
  const fuel = summarizeFuel(fuelInPeriod(fuelEntries, period), summary.totalMiles);
  const deadhead = analyzeDeadhead(summary, settings);
  const buckets = periodBuckets(loads, expenses, period);
  const quality = ratingBreakdown(periodLoads);
  const worstLoads = [...periodLoads]
    .sort((a, b) => a.metrics.profitPerMile - b.metrics.profitPerMile)
    .slice(0, 3);
  const topBroker = brokerPerformance(periodLoads, ratingThresholds)[0];
  const query = periodQuery(period);
  const insights = buildInsights(summary, priorSummary, categories, fuel, period, {
    deadhead,
    topBroker,
  });

  const brokers = [...new Set(loads.map((l) => l.broker).filter(Boolean))].sort() as string[];
  const profitable = summary.netProfit >= 0;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title="Dashboard"
        description={`${period.label} - ${summary.loadCount} ${summary.loadCount === 1 ? "load" : "loads"}, ${formatMiles(summary.totalMiles)}`}
        actions={
          <>
            <ExpenseFormDialog defaultDate={defaultEntryDate(period)} loads={periodLoads} />
            <LoadFormDialog
            brokers={brokers}
            defaultDate={defaultEntryDate(period)}
            ratingThresholds={ratingThresholds}
          />
          </>
        }
      />

      <PeriodControls period={period} />

      {/* Headline financials -- the four numbers that answer "am I making money". */}
      <section aria-label="Key financials" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label="Gross Revenue"
          value={formatMoneyCompact(summary.grossRevenue)}
          icon={Banknote}
          tone="info"
          emphasis
          delta={{ value: pctChange(summary.grossRevenue, priorSummary.grossRevenue) }}
          sub={`vs ${prior.shortLabel}`}
        />
        <KpiCard
          label="Operating Expenses"
          value={formatMoneyCompact(summary.operatingExpenses)}
          icon={TrendingDown}
          tone="negative"
          emphasis
          delta={{
            value: pctChange(summary.operatingExpenses, priorSummary.operatingExpenses),
            higherIsBetter: false,
          }}
          sub={`vs ${prior.shortLabel}`}
        />
        <KpiCard
          label="Net Profit"
          value={formatMoneyCompact(summary.netProfit)}
          icon={profitable ? TrendingUp : TrendingDown}
          tone={profitable ? "positive" : "negative"}
          emphasis
          delta={{ value: pctChange(summary.netProfit, priorSummary.netProfit) }}
          sub={`vs ${prior.shortLabel}`}
        />
        <KpiCard
          label="Net Margin"
          value={formatPercent(summary.netMargin)}
          icon={Percent}
          tone={summary.netMargin >= 25 ? "positive" : summary.netMargin >= 10 ? "warning" : "negative"}
          emphasis
          delta={{ value: summary.netMargin - priorSummary.netMargin }}
          sub="percentage points"
        />
      </section>

      {/* Operating metrics. */}
      <section
        aria-label="Operating metrics"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7"
      >
        <MiniStat label="Total Miles" value={formatNumber(summary.totalMiles)} sub="mi" />
        <MiniStat label="Loaded Miles" value={formatNumber(summary.loadedMiles)} sub="mi" />
        <MiniStat
          label="Deadhead Miles"
          value={formatNumber(summary.deadheadMiles)}
          sub="mi"
          tone={deadhead.elevated ? "warning" : "neutral"}
        />
        <MiniStat
          label="Deadhead %"
          value={formatPercent(summary.deadheadPct)}
          tone={deadhead.elevated ? "warning" : "positive"}
          sub={`threshold ${formatPercent(deadhead.warnPct, 0)}`}
        />
        <MiniStat
          label="Revenue / Mile"
          value={formatRate(summary.revenuePerMile)}
          tone="info"
          sub="all miles"
        />
        <MiniStat
          label="Cost / Mile"
          value={formatRate(summary.costPerMile)}
          tone="negative"
          sub="all expenses"
        />
        <MiniStat
          label="Profit / Mile"
          value={formatRate(summary.profitPerMile)}
          tone={summary.profitPerMile >= 0 ? "positive" : "negative"}
          sub="what you keep"
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Route className="size-3.5 text-muted-foreground" />
                <CardTitle>Revenue vs Expenses</CardTitle>
              </div>
              <span className="text-2xs text-muted-foreground">
                {period.days > 62 ? "By month" : "By day"} - {period.label}
              </span>
            </CardHeader>
            <CardContent className="px-2 py-3">
              <RevenueExpenseChart data={buckets} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Gauge className="size-3.5 text-muted-foreground" />
                <CardTitle>Collection & Costs</CardTitle>
              </div>
              <span className="text-2xs text-muted-foreground">{period.label}</span>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Collected" value={formatMoneyCompact(summary.paidRevenue)} tone="pos" />
              <Stat
                label="Outstanding"
                value={formatMoneyCompact(summary.outstandingRevenue)}
                tone={summary.outstandingRevenue > 0 ? "warn" : undefined}
              />
              <Stat label="Fixed Costs" value={formatMoneyCompact(summary.fixedExpenses)} />
              <Stat label="Variable Costs" value={formatMoneyCompact(summary.variableExpenses)} />
              <Stat label="Fuel Spend" value={formatMoneyCompact(summary.fuelExpense)} />
              <Stat
                label="Fuel / Mile"
                value={formatRate(fuel.fuelCostPerMile)}
                sub={fuel.milesPerGallon ? `${fuel.milesPerGallon.toFixed(1)} MPG` : undefined}
              />
            </CardContent>
          </Card>

          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <DeadheadCard analysis={deadhead} />
            <LoadQualityCard breakdown={quality} worst={worstLoads} periodQuery={query} />
          </div>

          <RecentLoads loads={periodLoads.slice(0, 8)} />
        </div>

        <div className="min-w-0 space-y-4">
          <MoneyBreakdownCard breakdown={breakdown} periodLabel={period.label} />
          <InsightsCard insights={insights} />

          <Card className="border-dashed">
            <CardContent className="flex items-start gap-2.5 p-3">
              <Wallet className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <p className="text-2xs leading-relaxed text-muted-foreground">
                Every figure above is recalculated from the loads and expenses actually dated inside{" "}
                <span className="text-foreground">{period.label}</span>. Nothing is prorated or
                split from a monthly total.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "pos" | "warn";
}) {
  return (
    <div>
      <p className="label-xs">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold tnum tracking-tight ${
          tone === "pos" ? "text-pos" : tone === "warn" ? "text-warn" : "text-foreground"
        }`}
      >
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-2xs text-muted-foreground tnum">{sub}</p> : null}
    </div>
  );
}
