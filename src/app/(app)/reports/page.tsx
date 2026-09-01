import type { Metadata } from "next";

import { RevenueExpenseChart } from "@/components/charts/revenue-expense-chart";
import { TrendLineChart } from "@/components/charts/trend-line-chart";
import { CategoryBreakdown } from "@/components/expenses/category-breakdown";
import { PeriodControls } from "@/components/dashboard/period-controls";
import { BrokerTable } from "@/components/reports/broker-table";
import { ExportMenu } from "@/components/reports/export-menu";
import { HalfMonthSplit } from "@/components/reports/half-month-split";
import { ReportSummary } from "@/components/reports/report-summary";
import { PageHeader } from "@/components/shared/page-header";
import { TruckSwitcher } from "@/components/fleet/truck-switcher";
import {
  PrintBarChart,
  PrintLineChart,
  PrintSplitBar,
  PRINT_INK,
} from "@/components/print/print-charts";
import {
  ReportColophon,
  ReportLetterhead,
  ReportRunningFooter,
} from "@/components/print/report-letterhead";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  linkedFuelByLoad,
  brokerPerformance,
  buildTrend,
  categoryTotals,
  expensesInPeriod,
  loadsInPeriod,
  summarizePeriod,
  thresholdsFromSettings,
  withMetricsAll,
} from "@/lib/calculations";
import { halfMonthComparison } from "@/lib/chart-data";
import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import {
  activeTrucks,
  expensesForTruck,
  loadsForTruck,
  orderedTrucks,
  truckById,
} from "@/lib/fleet";
import { formatDateMedium } from "@/lib/formatters";
import {
  periodFromSearchParams,
  scopeQuery,
  truckFromSearchParams,
  type SearchParams,
} from "@/lib/period-params";
import { monthLabel, previousPeriod, trailingHalfMonths, trailingMonths } from "@/lib/periods";

export const metadata: Metadata = { title: "Reports" };

/** One truck is named; a fleet is counted. */
function fleetLabel(
  trucks: Parameters<typeof activeTrucks>[0],
  truckId: string | null,
): string {
  const selected = truckById(trucks, truckId);
  if (selected) return selected.name;
  const active = activeTrucks(trucks);
  if (active.length === 1) return active[0].name;
  if (active.length === 0) return "No active truck";
  return `${active.length} trucks`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const session = await requireSession();
  const { business, trucks, loads, expenses, fuelEntries, settings } = await getRepository(
    session.businessId,
  ).getDataset();
  const period = periodFromSearchParams(params);
  const prior = previousPeriod(period);
  const truckId = truckFromSearchParams(params, trucks);
  const scopedLoads = loadsForTruck(loads, truckId);
  const scopedExpenses = expensesForTruck(expenses, truckId);

  const summary = summarizePeriod(scopedLoads, scopedExpenses, period, settings);
  const priorSummary = summarizePeriod(scopedLoads, scopedExpenses, prior, settings);
  const categories = categoryTotals(expensesInPeriod(scopedExpenses, period), settings);
  const halves = halfMonthComparison(scopedLoads, scopedExpenses, period.month);
  const thresholds = thresholdsFromSettings(settings);
  const brokers = brokerPerformance(
    withMetricsAll(loadsInPeriod(scopedLoads, period), thresholds, linkedFuelByLoad(fuelEntries)),
    thresholds,
  );
  const query = scopeQuery(period, truckId);

  // Trend windows: half-months read the operational rhythm, months read the trajectory.
  const halfTrend = buildTrend(
    scopedLoads,
    scopedExpenses,
    trailingHalfMonths(period.month, 8),
  );
  const monthTrend = buildTrend(scopedLoads, scopedExpenses, trailingMonths(period.month, 6));

  // Printed on the letterhead. Rendered on the server so the document states
  // when it was produced, rather than whenever a reader happens to open it.
  const generatedAt = new Date().toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  });
  const rangeLabel = `${formatDateMedium(period.start)} to ${formatDateMedium(period.end)}`;

  return (
    <div className="report-doc space-y-4 p-4 lg:p-6 print:space-y-3 print:p-0">
      <div className="print:hidden">
        <PageHeader
          title="Reports"
          description={`${period.label} - compared against ${prior.label}`}
          actions={<ExportMenu query={query} />}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <PeriodControls period={period} />
        <TruckSwitcher trucks={orderedTrucks(trucks)} selectedId={truckId} />
      </div>

      <ReportLetterhead
        businessName={business.name}
        truckName={fleetLabel(trucks, truckId)}
        periodLabel={period.label}
        comparisonLabel={prior.label}
        rangeLabel={rangeLabel}
        generatedAt={generatedAt}
        summary={summary}
      />

      <div className="grid gap-4 xl:grid-cols-3 print:gap-3">
        <div className="min-w-0 print-keep xl:col-span-2">
          <ReportSummary
            current={summary}
            previous={priorSummary}
            currentLabel={period.shortLabel}
            previousLabel={prior.shortLabel}
          />
        </div>
        <div className="min-w-0 space-y-4 print-keep">
          <HalfMonthSplit halves={halves} monthLabel={monthLabel(period.month)} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2 print:gap-3">
        <Card className="print-keep">
          <CardHeader>
            <CardTitle>Revenue vs Expenses</CardTitle>
            <span className="text-2xs text-muted-foreground">Last 8 half-months</span>
          </CardHeader>
          <CardContent className="px-2 py-3">
            <div className="print:hidden">
              <RevenueExpenseChart data={halfTrend} />
            </div>
            <div className="hidden print:block">
              <PrintBarChart
                data={halfTrend}
                series={[
                  { dataKey: "revenue", name: "Revenue", color: PRINT_INK.revenue },
                  { dataKey: "expenses", name: "Expenses", color: PRINT_INK.expense },
                ]}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="print-keep">
          <CardHeader>
            <CardTitle>Net Profit Trend</CardTitle>
            <span className="text-2xs text-muted-foreground">Last 6 months</span>
          </CardHeader>
          <CardContent className="px-2 py-3">
            <div className="print:hidden">
              <TrendLineChart
                data={monthTrend}
                height={240}
                series={[
                  { dataKey: "profit", name: "Net Profit", color: "hsl(var(--pos))" },
                  { dataKey: "revenue", name: "Revenue", color: "hsl(var(--info))" },
                ]}
              />
            </div>
            <div className="hidden print:block">
              <PrintLineChart
                data={monthTrend}
                series={[
                  { dataKey: "profit", name: "Net Profit", color: PRINT_INK.revenue },
                  { dataKey: "revenue", name: "Revenue", color: PRINT_INK.info },
                ]}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="print-keep">
          <CardHeader>
            <CardTitle>Revenue per Mile Trend</CardTitle>
            <span className="text-2xs text-muted-foreground">Last 8 half-months</span>
          </CardHeader>
          <CardContent className="px-2 py-3">
            <div className="print:hidden">
              <TrendLineChart
                data={halfTrend}
                formatter="rate"
                series={[
                  { dataKey: "revenuePerMile", name: "Revenue / mi", color: "hsl(var(--info))" },
                  { dataKey: "profitPerMile", name: "Profit / mi", color: "hsl(var(--pos))" },
                ]}
              />
            </div>
            <div className="hidden print:block">
              <PrintLineChart
                data={halfTrend}
                kind="rate"
                series={[
                  { dataKey: "revenuePerMile", name: "Revenue / mi", color: PRINT_INK.info },
                  { dataKey: "profitPerMile", name: "Profit / mi", color: PRINT_INK.revenue },
                ]}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="print-keep">
          <CardHeader>
            <CardTitle>Cost per Mile Trend</CardTitle>
            <span className="text-2xs text-muted-foreground">Last 8 half-months</span>
          </CardHeader>
          <CardContent className="px-2 py-3">
            <div className="print:hidden">
              <TrendLineChart
                data={halfTrend}
                formatter="rate"
                series={[{ dataKey: "costPerMile", name: "Cost / mi", color: "hsl(var(--neg))" }]}
              />
            </div>
            <div className="hidden print:block">
              <PrintLineChart
                data={halfTrend}
                kind="rate"
                series={[{ dataKey: "costPerMile", name: "Cost / mi", color: PRINT_INK.expense }]}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="print-break-before">
        <BrokerTable brokers={brokers} deadheadWarnPct={settings.deadheadWarnPct} />
      </div>

      <div className="print-break-before grid gap-4 xl:grid-cols-3 print:gap-3">
        <div className="min-w-0 xl:col-span-1">
          <CategoryBreakdown categories={categories} total={summary.operatingExpenses} />
        </div>
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Fixed vs Variable</CardTitle>
            <span className="text-2xs text-muted-foreground">{period.label}</span>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="print:hidden">
              <SplitBar
                fixed={summary.fixedExpenses}
                variable={summary.variableExpenses}
                total={summary.operatingExpenses}
              />
            </div>
            <div className="hidden print:block">
              <PrintSplitBar
                fixed={summary.fixedExpenses}
                variable={summary.variableExpenses}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <BehaviorList
                title="Fixed"
                items={categories.filter((c) => c.behavior === "FIXED")}
                total={summary.fixedExpenses}
              />
              <BehaviorList
                title="Variable"
                items={categories.filter((c) => c.behavior === "VARIABLE")}
                total={summary.variableExpenses}
              />
            </div>
            <p className="text-2xs leading-relaxed text-muted-foreground">
              Fixed costs are the ones you owe whether the truck rolls or not. Variable costs move
              with miles. Both classifications are editable per category in Settings, and every
              report re-splits immediately.
            </p>
          </CardContent>
        </Card>
      </div>

      <ReportColophon
        periodLabel={period.label}
        operatingExpenses={summary.operatingExpenses}
      />

      <ReportRunningFooter businessName={business.name} periodLabel={period.label} />
    </div>
  );
}

function SplitBar({
  fixed,
  variable,
  total,
}: {
  fixed: number;
  variable: number;
  total: number;
}) {
  const fixedPct = total > 0 ? (fixed / total) * 100 : 0;
  const variablePct = total > 0 ? (variable / total) * 100 : 0;
  const money = (value: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-info">
          Fixed {money(fixed)}{" "}
          <span className="text-muted-foreground tnum">({fixedPct.toFixed(1)}%)</span>
        </span>
        <span className="text-warn">
          <span className="text-muted-foreground tnum">({variablePct.toFixed(1)}%)</span>{" "}
          {money(variable)} Variable
        </span>
      </div>
      <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-surface-sunken">
        <div className="bg-info" style={{ width: `${fixedPct}%` }} />
        <div className="bg-warn" style={{ width: `${variablePct}%` }} />
      </div>
    </div>
  );
}

function BehaviorList({
  title,
  items,
  total,
}: {
  title: string;
  items: { category: string; label: string; amount: number }[];
  total: number;
}) {
  const money = (value: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(value);

  return (
    <div className="rounded-md border border-border bg-surface-sunken p-3">
      <div className="flex items-baseline justify-between">
        <p className="label-xs">{title}</p>
        <p className="tnum text-sm font-semibold">{money(total)}</p>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-2xs text-muted-foreground">Nothing recorded in this period.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.map((item) => (
            <li key={item.category} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-muted-foreground">{item.label}</span>
              <span className="shrink-0 tnum">{money(item.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
