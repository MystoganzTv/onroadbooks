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
  thresholdsFromSettings,
  withMetricsAll,
} from "@/lib/calculations";
import { halfMonthComparison } from "@/lib/chart-data";
import { buildFinancialSummary } from "@/lib/finance/financial-summary";
import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import {
  activeTrucks,
  expensesForTruck,
  loadsForTruck,
  orderedTrucks,
  truckById,
} from "@/lib/fleet";
import { categoryLabel } from "@/lib/categories";
import { formatLocaleDate, formatLocalePeriod, localeTag } from "@/lib/i18n-format";
import { getWebDictionary, interpolate, type WebDictionary } from "@/lib/i18n/dictionaries";
import { getAppLocale } from "@/lib/i18n-server";
import type { AppLocale } from "@/lib/i18n";
import { isOperatingExpense } from "@/lib/finance/terminology";
import {
  periodFromSearchParams,
  scopeQuery,
  truckFromSearchParams,
  type SearchParams,
} from "@/lib/period-params";
import { previousPeriod, trailingHalfMonths, trailingMonths } from "@/lib/periods";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).reports.metadataTitle };
}

/** One truck is named; a fleet is counted. */
function fleetLabel(
  trucks: Parameters<typeof activeTrucks>[0],
  truckId: string | null,
  copy: WebDictionary["reports"],
): string {
  const selected = truckById(trucks, truckId);
  if (selected) return selected.name;
  const active = activeTrucks(trucks);
  if (active.length === 1) return active[0].name;
  if (active.length === 0) return copy.noActiveTruck;
  return interpolate(copy.truckCount, { count: active.length });
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [params, session, locale] = await Promise.all([
    searchParams,
    requireSession(),
    getAppLocale(),
  ]);
  const copy = getWebDictionary(locale).reports;
  const { business, trucks, loads, expenses, fuelEntries, settings, paymentEvents, reserveAccounts } = await getRepository(
    session.businessId,
  ).getDataset();
  const period = periodFromSearchParams(params);
  const prior = previousPeriod(period);
  const truckId = truckFromSearchParams(params, trucks);
  const scopedLoads = loadsForTruck(loads, truckId);
  const scopedExpenses = expensesForTruck(expenses, truckId);

  const summary = buildFinancialSummary(scopedLoads, scopedExpenses, paymentEvents, period, settings, reserveAccounts);
  const priorSummary = buildFinancialSummary(scopedLoads, scopedExpenses, paymentEvents, prior, settings, reserveAccounts);
  const categories = categoryTotals(
    expensesInPeriod(scopedExpenses, period).filter((expense) =>
      isOperatingExpense(expense),
    ),
    settings,
  );
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
  const generatedAt = new Date().toLocaleString(localeTag(locale), {
    dateStyle: "long",
    timeStyle: "short",
  });
  const rangeLabel = `${formatLocaleDate(period.start, locale)} ${copy.rangeConnector} ${formatLocaleDate(period.end, locale)}`;
  const periodLong = formatLocalePeriod(period, locale);
  const priorLong = formatLocalePeriod(prior, locale);
  const periodShort = formatLocalePeriod(period, locale, "short");
  const priorShort = formatLocalePeriod(prior, locale, "short");
  const monthName = formatLocaleDate(`${period.month}-01`, locale, {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="report-doc space-y-4 p-4 lg:p-6 print:space-y-3 print:p-0">
      <div className="print:hidden">
        <PageHeader
          title={copy.title}
          description={interpolate(copy.comparison, {
            current: periodLong,
            previous: priorLong,
          })}
          actions={<ExportMenu query={query} year={Number(period.month.slice(0, 4))} />}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <PeriodControls period={period} />
        <TruckSwitcher trucks={orderedTrucks(trucks)} selectedId={truckId} />
      </div>

      <Card className="border-info/30 bg-info-soft/30 print:hidden">
        <CardContent className="p-4 text-xs leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">{copy.accountantLead}</span>{" "}
          {copy.accountantNote}
        </CardContent>
      </Card>

      <ReportLetterhead
        businessName={business.name}
        truckName={fleetLabel(trucks, truckId, copy)}
        periodLabel={periodLong}
        comparisonLabel={priorLong}
        rangeLabel={rangeLabel}
        generatedAt={generatedAt}
        summary={summary}
      />

      <div className="grid gap-4 xl:grid-cols-3 print:gap-3">
        <div className="min-w-0 print-keep xl:col-span-2">
          <ReportSummary
            current={summary}
            previous={priorSummary}
            currentLabel={periodShort}
            previousLabel={priorShort}
          />
        </div>
        <div className="min-w-0 space-y-4 print-keep">
          <HalfMonthSplit halves={halves} monthLabel={monthName} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2 print:gap-3">
        <Card className="print-keep">
          <CardHeader>
            <CardTitle>{copy.revenueVsExpenses}</CardTitle>
            <span className="text-2xs text-muted-foreground">{copy.lastHalfMonths}</span>
          </CardHeader>
          <CardContent className="px-2 py-3">
            <div className="print:hidden">
              <RevenueExpenseChart data={halfTrend} />
            </div>
            <div className="hidden print:block">
              <PrintBarChart
                data={halfTrend}
                series={[
                  { dataKey: "revenue", name: copy.bookedRevenue, color: PRINT_INK.revenue },
                  { dataKey: "expenses", name: copy.businessExpenses, color: PRINT_INK.expense },
                ]}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="print-keep">
          <CardHeader>
            <CardTitle>{copy.profitTrend}</CardTitle>
            <span className="text-2xs text-muted-foreground">{copy.lastMonths}</span>
          </CardHeader>
          <CardContent className="px-2 py-3">
            <div className="print:hidden">
              <TrendLineChart
                data={monthTrend}
                height={240}
                series={[
                  { dataKey: "profit", name: copy.operatingProfit, color: "hsl(var(--pos))" },
                  { dataKey: "revenue", name: copy.bookedRevenue, color: "hsl(var(--info))" },
                ]}
              />
            </div>
            <div className="hidden print:block">
              <PrintLineChart
                data={monthTrend}
                series={[
                  { dataKey: "profit", name: copy.operatingProfit, color: PRINT_INK.revenue },
                  { dataKey: "revenue", name: copy.bookedRevenue, color: PRINT_INK.info },
                ]}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="print-keep">
          <CardHeader>
            <CardTitle>{copy.revenuePerMileTrend}</CardTitle>
            <span className="text-2xs text-muted-foreground">{copy.lastHalfMonths}</span>
          </CardHeader>
          <CardContent className="px-2 py-3">
            <div className="print:hidden">
              <TrendLineChart
                data={halfTrend}
                formatter="rate"
                series={[
                  { dataKey: "revenuePerMile", name: copy.revenuePerMile, color: "hsl(var(--info))" },
                  { dataKey: "profitPerMile", name: copy.profitPerMile, color: "hsl(var(--pos))" },
                ]}
              />
            </div>
            <div className="hidden print:block">
              <PrintLineChart
                data={halfTrend}
                kind="rate"
                series={[
                  { dataKey: "revenuePerMile", name: copy.revenuePerMile, color: PRINT_INK.info },
                  { dataKey: "profitPerMile", name: copy.profitPerMile, color: PRINT_INK.revenue },
                ]}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="print-keep">
          <CardHeader>
            <CardTitle>{copy.costPerMileTrend}</CardTitle>
            <span className="text-2xs text-muted-foreground">{copy.lastHalfMonths}</span>
          </CardHeader>
          <CardContent className="px-2 py-3">
            <div className="print:hidden">
              <TrendLineChart
                data={halfTrend}
                formatter="rate"
                series={[{ dataKey: "costPerMile", name: copy.costPerMile, color: "hsl(var(--neg))" }]}
              />
            </div>
            <div className="hidden print:block">
              <PrintLineChart
                data={halfTrend}
                kind="rate"
                series={[{ dataKey: "costPerMile", name: copy.costPerMile, color: PRINT_INK.expense }]}
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
            <CardTitle>{copy.fixedVsVariable}</CardTitle>
            <span className="text-2xs text-muted-foreground">{periodLong}</span>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="print:hidden">
              <SplitBar
                fixed={summary.fixedExpenses}
                variable={summary.variableExpenses}
                total={summary.operatingExpenses}
                locale={locale}
                copy={copy}
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
                title={copy.fixed}
                items={categories.filter((c) => c.behavior === "FIXED").map((item) => ({
                  ...item,
                  label: categoryLabel(item.category, locale),
                }))}
                total={summary.fixedExpenses}
                locale={locale}
                emptyText={copy.nothingRecorded}
              />
              <BehaviorList
                title={copy.variable}
                items={categories.filter((c) => c.behavior === "VARIABLE").map((item) => ({
                  ...item,
                  label: categoryLabel(item.category, locale),
                }))}
                total={summary.variableExpenses}
                locale={locale}
                emptyText={copy.nothingRecorded}
              />
            </div>
            <p className="text-2xs leading-relaxed text-muted-foreground">
              {copy.classificationNote}
            </p>
          </CardContent>
        </Card>
      </div>

      <ReportColophon
        periodLabel={periodLong}
        operatingExpenses={summary.operatingExpenses}
      />

      <ReportRunningFooter businessName={business.name} periodLabel={periodLong} />
    </div>
  );
}

function SplitBar({
  fixed,
  variable,
  total,
  locale,
  copy,
}: {
  fixed: number;
  variable: number;
  total: number;
  locale: AppLocale;
  copy: WebDictionary["reports"];
}) {
  const fixedPct = total > 0 ? (fixed / total) * 100 : 0;
  const variablePct = total > 0 ? (variable / total) * 100 : 0;
  const money = (value: number) =>
    new Intl.NumberFormat(localeTag(locale), { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-info">
          {copy.fixed} {money(fixed)}{" "}
          <span className="text-muted-foreground tnum">({fixedPct.toFixed(1)}%)</span>
        </span>
        <span className="text-warn">
          <span className="text-muted-foreground tnum">({variablePct.toFixed(1)}%)</span>{" "}
          {money(variable)} {copy.variable}
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
  locale,
  emptyText,
}: {
  title: string;
  items: { category: string; label: string; amount: number }[];
  total: number;
  locale: AppLocale;
  emptyText: string;
}) {
  const money = (value: number) =>
    new Intl.NumberFormat(localeTag(locale), { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(value);

  return (
    <div className="rounded-md border border-border bg-surface-sunken p-3">
      <div className="flex items-baseline justify-between">
        <p className="label-xs">{title}</p>
        <p className="tnum text-sm font-semibold">{money(total)}</p>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-2xs text-muted-foreground">{emptyText}</p>
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
