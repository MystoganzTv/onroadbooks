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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
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
import { periodFromSearchParams, periodQuery, type SearchParams } from "@/lib/period-params";
import { monthLabel, previousPeriod, trailingHalfMonths, trailingMonths } from "@/lib/periods";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const session = await requireSession();
  const { loads, expenses, settings } = await getRepository(session.businessId).getDataset();
  const period = periodFromSearchParams(params);
  const prior = previousPeriod(period);

  const summary = summarizePeriod(loads, expenses, period, settings);
  const priorSummary = summarizePeriod(loads, expenses, prior, settings);
  const categories = categoryTotals(expensesInPeriod(expenses, period), settings);
  const halves = halfMonthComparison(loads, expenses, period.month);
  const thresholds = thresholdsFromSettings(settings);
  const brokers = brokerPerformance(
    withMetricsAll(loadsInPeriod(loads, period), thresholds),
    thresholds,
  );
  const query = periodQuery(period);

  // Trend windows: half-months read the operational rhythm, months read the trajectory.
  const halfTrend = buildTrend(loads, expenses, trailingHalfMonths(period.month, 8));
  const monthTrend = buildTrend(loads, expenses, trailingMonths(period.month, 6));

  return (
    <div className="space-y-4 p-4 lg:p-6 print:p-0">
      <PageHeader
        title="Reports"
        description={`${period.label} - compared against ${prior.label}`}
        actions={<ExportMenu periodQuery={query} />}
      />

      <PeriodControls period={period} />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <ReportSummary
            current={summary}
            previous={priorSummary}
            currentLabel={period.shortLabel}
            previousLabel={prior.shortLabel}
          />
        </div>
        <div className="min-w-0 space-y-4">
          <HalfMonthSplit halves={halves} monthLabel={monthLabel(period.month)} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue vs Expenses</CardTitle>
            <span className="text-2xs text-muted-foreground">Last 8 half-months</span>
          </CardHeader>
          <CardContent className="px-2 py-3">
            <RevenueExpenseChart data={halfTrend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Net Profit Trend</CardTitle>
            <span className="text-2xs text-muted-foreground">Last 6 months</span>
          </CardHeader>
          <CardContent className="px-2 py-3">
            <TrendLineChart
              data={monthTrend}
              height={240}
              series={[
                { dataKey: "profit", name: "Net Profit", color: "hsl(var(--pos))" },
                { dataKey: "revenue", name: "Revenue", color: "hsl(var(--info))" },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue per Mile Trend</CardTitle>
            <span className="text-2xs text-muted-foreground">Last 8 half-months</span>
          </CardHeader>
          <CardContent className="px-2 py-3">
            <TrendLineChart
              data={halfTrend}
              formatter="rate"
              series={[
                { dataKey: "revenuePerMile", name: "Revenue / mi", color: "hsl(var(--info))" },
                { dataKey: "profitPerMile", name: "Profit / mi", color: "hsl(var(--pos))" },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cost per Mile Trend</CardTitle>
            <span className="text-2xs text-muted-foreground">Last 8 half-months</span>
          </CardHeader>
          <CardContent className="px-2 py-3">
            <TrendLineChart
              data={halfTrend}
              formatter="rate"
              series={[{ dataKey: "costPerMile", name: "Cost / mi", color: "hsl(var(--neg))" }]}
            />
          </CardContent>
        </Card>
      </div>

      <BrokerTable brokers={brokers} />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-1">
          <CategoryBreakdown categories={categories} total={summary.operatingExpenses} />
        </div>
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Fixed vs Variable</CardTitle>
            <span className="text-2xs text-muted-foreground">{period.label}</span>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <SplitBar
              fixed={summary.fixedExpenses}
              variable={summary.variableExpenses}
              total={summary.operatingExpenses}
            />
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
