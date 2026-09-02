import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { PeriodControls } from "@/components/dashboard/period-controls";
import { MiniStat } from "@/components/dashboard/mini-stat";
import { ExportMenu } from "@/components/reports/export-menu";
import { HistoryBackButton } from "@/components/shared/history-back-button";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireSession } from "@/lib/auth";
import { categoryLabel } from "@/lib/categories";
import {
  linkedFuelByLoad,
  categoryTotals,
  expensesInPeriod,
  loadsInPeriod,
  summarizePeriod,
  thresholdsFromSettings,
  withMetricsAll,
} from "@/lib/calculations";
import { getDataset } from "@/lib/db";
import { calculateFleetSummary } from "@/lib/finance/fleet";
import { isOperatingExpenseCategory } from "@/lib/finance/terminology";
import { expensesForTruck, loadsForTruck, orderedTrucks, truckById } from "@/lib/fleet";
import {
  formatMiles,
  formatMoney,
  formatMoneyCompact,
  formatPercent,
  formatRateValue,
} from "@/lib/formatters";
import { formatLocaleDate, formatLocalePeriod } from "@/lib/i18n-format";
import { getWebDictionary, interpolate } from "@/lib/i18n/dictionaries";
import { getAppLocale } from "@/lib/i18n-server";
import { hasFleetAccess } from "@/lib/plans";
import {
  periodFromSearchParams,
  periodQuery,
  scopeQuery,
  type SearchParams,
} from "@/lib/period-params";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).fleet.unitMetadataTitle };
}

export default async function FleetUnitPage({
  params,
  searchParams,
}: {
  params: Promise<{ truckId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ truckId }, queryParams, session, locale] = await Promise.all([
    params,
    searchParams,
    requireSession(),
    getAppLocale(),
  ]);
  const copy = getWebDictionary(locale).fleet;
  const dataset = await getDataset(session.businessId);
  if (!hasFleetAccess(dataset.subscription)) redirect("/truck");

  const truck = truckById(dataset.trucks, truckId);
  if (!truck) notFound();

  const period = periodFromSearchParams(queryParams);
  const query = scopeQuery(period, truck.id);
  const unitLoads = loadsForTruck(dataset.loads, truck.id);
  const unitExpenses = expensesForTruck(dataset.expenses, truck.id);
  const summary = summarizePeriod(unitLoads, unitExpenses, period, dataset.settings, dataset.paymentEvents);
  const fleet = calculateFleetSummary(
    orderedTrucks(dataset.trucks),
    dataset.loads,
    dataset.expenses,
    period,
    dataset.settings,
    dataset.paymentEvents,
  );
  const contribution = fleet.units.find((unit) => unit.truck.id === truck.id);
  if (!contribution) notFound();

  const categories = categoryTotals(
    expensesInPeriod(unitExpenses, period).filter((expense) =>
      isOperatingExpenseCategory(expense.category),
    ),
    dataset.settings,
  );
  const thresholds = thresholdsFromSettings(dataset.settings);
  const recentLoads = withMetricsAll(
    loadsInPeriod(unitLoads, period),
    thresholds,
    linkedFuelByLoad(dataset.fuelEntries),
  )
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, 8);
  const vehicle = [truck.year, truck.make, truck.model].filter(Boolean).join(" ");
  const periodLong = formatLocalePeriod(period, locale);
  const periodShort = formatLocalePeriod(period, locale, "short");

  return (
    <div className="report-doc space-y-4 p-4 lg:p-6 print:p-0">
      <div className="print:hidden">
        <HistoryBackButton
          fallbackHref={`/fleet?${periodQuery(period)}`}
          label={copy.back}
          className="-ml-2 mb-3"
        />
        <PageHeader
          title={truck.name}
          description={`${vehicle || copy.vehicleMissing} · ${periodLong}`}
          actions={<ExportMenu query={query} year={Number(period.month.slice(0, 4))} />}
        />
      </div>

      <div className="print:hidden">
        <PeriodControls period={period} />
      </div>

      <div className="hidden border-b-2 border-foreground pb-3 print:block">
        <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {copy.printStatement}
        </p>
        <div className="mt-1 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{truck.name}</h1>
            <p className="text-sm text-muted-foreground">{vehicle || copy.vehicleMissing}</p>
          </div>
          <p className="text-right text-xs text-muted-foreground">{periodLong}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
        <MiniStat
          label={copy.bookedRevenue}
          value={formatMoneyCompact(summary.bookedRevenue)}
          sub={`${summary.loadCount} ${summary.loadCount === 1 ? copy.load : copy.loads}`}
          tone="info"
        />
        <MiniStat
          label={copy.unitCosts}
          value={formatMoneyCompact(summary.operatingExpenses)}
          sub={copy.chargedToTruck}
          tone={summary.operatingExpenses > 0 ? "negative" : "neutral"}
        />
        <MiniStat
          label={copy.contribution}
          value={formatMoneyCompact(summary.operatingProfit)}
          sub={interpolate(copy.margin, { percent: formatPercent(summary.netMargin) })}
          tone={summary.operatingProfit >= 0 ? "positive" : "negative"}
        />
        <MiniStat
          label={copy.contributionPerMile}
          value={formatRateValue(summary.profitPerMile)}
          sub={interpolate(copy.overMiles, { miles: formatMiles(summary.totalMiles) })}
          tone={summary.profitPerMile >= 0 ? "positive" : "negative"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="print-keep xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>{copy.unitStatement}</CardTitle>
              <p className="mt-1 text-2xs text-muted-foreground">
                {interpolate(copy.unitStatementDescription, { truck: truck.name })}
              </p>
            </div>
            <span className="text-2xs text-muted-foreground">{periodShort}</span>
          </CardHeader>
          <CardContent className="p-0">
            <StatementLine label={copy.bookedRevenue} value={summary.bookedRevenue} emphasis />
            <div className="border-y border-border bg-surface-sunken/35 px-4 py-2">
              <p className="label-xs">{copy.businessExpenses}</p>
            </div>
            {categories.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">
                {interpolate(copy.noUnitCosts, { period: periodLong })}
              </p>
            ) : (
              categories.map((category) => (
                <StatementLine
                  key={category.category}
                  label={categoryLabel(category.category, locale)}
                  value={-category.amount}
                  note={
                    category.behavior === "FIXED"
                      ? getWebDictionary(locale).common.fixed
                      : getWebDictionary(locale).common.variable
                  }
                />
              ))
            )}
            <StatementLine
              label={copy.totalUnitCosts}
              value={-summary.operatingExpenses}
              emphasis
            />
            <div className="flex items-baseline justify-between border-t-2 border-border bg-primary/5 px-4 py-3">
              <div>
                <p className="font-semibold">{copy.unitContribution}</p>
                <p className="mt-0.5 text-2xs text-muted-foreground">
                  {copy.unitContributionHint}
                </p>
              </div>
              <p
                className={cn(
                  "text-xl font-semibold tnum",
                  summary.operatingProfit >= 0 ? "text-pos" : "text-neg",
                )}
              >
                {formatMoney(summary.operatingProfit)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="print-keep">
          <CardHeader>
            <CardTitle>{copy.fleetContext}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ContextLine label={copy.thisUnitContribution} value={contribution.contribution} />
            <ContextLine label={copy.allUnitsContribution} value={fleet.contribution} />
            <ContextLine label={copy.businessOverhead} value={-fleet.overhead} />
            <div className="flex items-center justify-between border-t border-border pt-3 font-semibold">
              <span>{copy.companyProfit}</span>
              <span className={cn("tnum", fleet.operatingProfit >= 0 ? "text-pos" : "text-neg")}>
                {formatMoney(fleet.operatingProfit)}
              </span>
            </div>
            <ContextLine label={copy.debtCashBurden} value={-contribution.debtService} />
            <p className="border-t border-border pt-3 text-2xs leading-relaxed text-muted-foreground">
              {copy.overheadExplanation}
            </p>
            <Button asChild variant="outline" size="sm" className="w-full print:hidden">
              <Link href={`/fleet?${periodQuery(period)}`}>
                {copy.viewReconciliation}
                <ExternalLink />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="print-keep">
        <CardHeader>
          <div>
            <CardTitle>{copy.loadDrilldown}</CardTitle>
            <p className="mt-1 text-2xs text-muted-foreground">
              {copy.drilldownDescription}
            </p>
          </div>
          <Button asChild variant="ghost" size="sm" className="print:hidden">
            <Link href={`/loads?${query}`}>{copy.allUnitLoads}</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {recentLoads.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {interpolate(copy.noUnitLoads, { truck: truck.name, period: periodLong })}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{copy.date}</TableHead>
                    <TableHead>{copy.route}</TableHead>
                    <TableHead>{copy.broker}</TableHead>
                    <TableHead className="text-right">{copy.miles}</TableHead>
                    <TableHead className="text-right">{copy.grossRate}</TableHead>
                    <TableHead className="text-right">{copy.contributionProfit}</TableHead>
                    <TableHead className="text-right print:hidden">{copy.open}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentLoads.map((load) => (
                    <TableRow key={load.id}>
                      <TableCell>
                        {formatLocaleDate(load.date, locale, { month: "short", day: "numeric" })}
                      </TableCell>
                      <TableCell className="font-medium">
                        {load.originCity}, {load.originState} → {load.destinationCity},{" "}
                        {load.destinationState}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{load.broker || "—"}</TableCell>
                      <TableCell className="text-right tnum">
                        {formatMiles(load.metrics.totalMiles)}
                      </TableCell>
                      <TableCell className="text-right tnum">
                        {formatMoney(load.grossRate)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tnum",
                          load.metrics.tripProfit < 0 && "text-neg",
                        )}
                      >
                        {formatMoney(load.metrics.tripProfit)}
                      </TableCell>
                      <TableCell className="text-right print:hidden">
                        <Link
                          href={`/loads/${load.id}?${query}`}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          {copy.details}
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 print:hidden">
        <Button asChild variant="outline" size="sm">
          <Link href={`/dashboard?${query}`}>{copy.unitDashboard}</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/expenses?${query}`}>{copy.unitExpenses}</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/fuel?${query}`}>{copy.unitFuel}</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/reports?${query}`}>{copy.fullUnitReport}</Link>
        </Button>
      </div>
    </div>
  );
}

function StatementLine({
  label,
  value,
  note,
  emphasis = false,
}: {
  label: string;
  value: number;
  note?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/70 px-4 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <p className={cn("truncate text-sm", emphasis && "font-semibold")}>{label}</p>
        {note ? <p className="text-2xs text-muted-foreground">{note}</p> : null}
      </div>
      <p className={cn("shrink-0 tnum text-sm", emphasis && "font-semibold", value < 0 && "text-neg")}>
        {formatMoney(value)}
      </p>
    </div>
  );
}

function ContextLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tnum", value < 0 && "text-neg")}>{formatMoney(value)}</span>
    </div>
  );
}
