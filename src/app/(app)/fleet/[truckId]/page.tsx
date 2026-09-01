import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";

import { PeriodControls } from "@/components/dashboard/period-controls";
import { MiniStat } from "@/components/dashboard/mini-stat";
import { ExportMenu } from "@/components/reports/export-menu";
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
import {
  linkedFuelByLoad,
  categoryTotals,
  expensesInPeriod,
  loadsInPeriod,
  summarizePeriod,
  thresholdsFromSettings,
  withMetricsAll,
} from "@/lib/calculations";
import { getRepository } from "@/lib/db";
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
import { hasFleetAccess } from "@/lib/plans";
import {
  periodFromSearchParams,
  periodQuery,
  scopeQuery,
  type SearchParams,
} from "@/lib/period-params";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Unit performance" };

export default async function FleetUnitPage({
  params,
  searchParams,
}: {
  params: Promise<{ truckId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ truckId }, queryParams, session] = await Promise.all([
    params,
    searchParams,
    requireSession(),
  ]);
  const dataset = await getRepository(session.businessId).getDataset();
  if (!hasFleetAccess(dataset.subscription)) redirect("/truck");

  const truck = truckById(dataset.trucks, truckId);
  if (!truck) notFound();

  const period = periodFromSearchParams(queryParams);
  const query = scopeQuery(period, truck.id);
  const unitLoads = loadsForTruck(dataset.loads, truck.id);
  const unitExpenses = expensesForTruck(dataset.expenses, truck.id);
  const summary = summarizePeriod(unitLoads, unitExpenses, period, dataset.settings);
  const fleet = calculateFleetSummary(
    orderedTrucks(dataset.trucks),
    dataset.loads,
    dataset.expenses,
    period,
    dataset.settings,
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

  return (
    <div className="report-doc space-y-4 p-4 lg:p-6 print:p-0">
      <div className="print:hidden">
        <Link
          href={`/fleet?${periodQuery(period)}`}
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" aria-hidden />
          Back to fleet
        </Link>
        <PageHeader
          title={truck.name}
          description={`${vehicle || "Vehicle details not added"} · ${period.label}`}
          actions={<ExportMenu query={query} />}
        />
      </div>

      <div className="print:hidden">
        <PeriodControls period={period} />
      </div>

      <div className="hidden border-b-2 border-foreground pb-3 print:block">
        <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          OnRoad Books · Unit Contribution Statement
        </p>
        <div className="mt-1 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{truck.name}</h1>
            <p className="text-sm text-muted-foreground">{vehicle || "Vehicle details not added"}</p>
          </div>
          <p className="text-right text-xs text-muted-foreground">{period.label}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
        <MiniStat
          label="Booked Revenue"
          value={formatMoneyCompact(summary.bookedRevenue)}
          sub={`${summary.loadCount} ${summary.loadCount === 1 ? "load" : "loads"}`}
          tone="info"
        />
        <MiniStat
          label="Unit costs"
          value={formatMoneyCompact(summary.operatingExpenses)}
          sub="charged to this truck"
          tone={summary.operatingExpenses > 0 ? "negative" : "neutral"}
        />
        <MiniStat
          label="Contribution"
          value={formatMoneyCompact(summary.operatingProfit)}
          sub={`${formatPercent(summary.netMargin)} margin`}
          tone={summary.operatingProfit >= 0 ? "positive" : "negative"}
        />
        <MiniStat
          label="Contribution / mile"
          value={formatRateValue(summary.profitPerMile)}
          sub={`over ${formatMiles(summary.totalMiles)}`}
          tone={summary.profitPerMile >= 0 ? "positive" : "negative"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="print-keep xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Unit Contribution Statement</CardTitle>
              <p className="mt-1 text-2xs text-muted-foreground">
                Booked Revenue less operating costs assigned to {truck.name}; Debt Service is separate.
              </p>
            </div>
            <span className="text-2xs text-muted-foreground">{period.shortLabel}</span>
          </CardHeader>
          <CardContent className="p-0">
            <StatementLine label="Booked Revenue" value={summary.bookedRevenue} emphasis />
            <div className="border-y border-border bg-surface-sunken/35 px-4 py-2">
              <p className="label-xs">Operating expenses</p>
            </div>
            {categories.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">
                No costs were charged to this unit in {period.label}.
              </p>
            ) : (
              categories.map((category) => (
                <StatementLine
                  key={category.category}
                  label={category.label}
                  value={-category.amount}
                  note={category.behavior === "FIXED" ? "Fixed" : "Variable"}
                />
              ))
            )}
            <StatementLine
              label="Total unit costs"
              value={-summary.operatingExpenses}
              emphasis
            />
            <div className="flex items-baseline justify-between border-t-2 border-border bg-primary/5 px-4 py-3">
              <div>
                <p className="font-semibold">Unit contribution</p>
                <p className="mt-0.5 text-2xs text-muted-foreground">
                  Booked Revenue minus operating costs caused by this truck
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
            <CardTitle>Fleet context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ContextLine label="This unit's contribution" value={contribution.contribution} />
            <ContextLine label="All units' contribution" value={fleet.contribution} />
            <ContextLine label="Business overhead" value={-fleet.overhead} />
            <div className="flex items-center justify-between border-t border-border pt-3 font-semibold">
              <span>Company Operating Profit</span>
              <span className={cn("tnum", fleet.operatingProfit >= 0 ? "text-pos" : "text-neg")}>
                {formatMoney(fleet.operatingProfit)}
              </span>
            </div>
            <ContextLine label="Debt Service (cash burden)" value={-contribution.debtService} />
            <p className="border-t border-border pt-3 text-2xs leading-relaxed text-muted-foreground">
              Company overhead is shown here for reconciliation, but it is not assigned to this
              truck. That keeps the unit result factual instead of inventing an allocation rule.
            </p>
            <Button asChild variant="outline" size="sm" className="w-full print:hidden">
              <Link href={`/fleet?${periodQuery(period)}`}>
                View fleet reconciliation
                <ExternalLink />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="print-keep">
        <CardHeader>
          <div>
            <CardTitle>Load drill-down</CardTitle>
            <p className="mt-1 text-2xs text-muted-foreground">
              Open a load to inspect its route, miles, rate and trip costs.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm" className="print:hidden">
            <Link href={`/loads?${query}`}>All unit loads</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {recentLoads.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No loads for {truck.name} in {period.label}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Broker</TableHead>
                    <TableHead className="text-right">Miles</TableHead>
                    <TableHead className="text-right">Gross Rate</TableHead>
                    <TableHead className="text-right">Contribution Profit</TableHead>
                    <TableHead className="text-right print:hidden">Open</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentLoads.map((load) => (
                    <TableRow key={load.id}>
                      <TableCell>{load.date}</TableCell>
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
                          Details
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
          <Link href={`/dashboard?${query}`}>Unit dashboard</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/expenses?${query}`}>Unit expenses</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/fuel?${query}`}>Unit fuel</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/reports?${query}`}>Full unit report</Link>
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
