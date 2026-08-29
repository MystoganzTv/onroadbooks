import type { Metadata } from "next";
import Link from "next/link";

import { AnalyticsTabs } from "@/components/cockpit/analytics-tabs";
import { TruckSwitcher } from "@/components/fleet/truck-switcher";
import { PeriodControls } from "@/components/dashboard/period-controls";
import { MiniStat } from "@/components/dashboard/mini-stat";
import { RatingBadge } from "@/components/loads/rating-badge";
import { PageHeader } from "@/components/shared/page-header";
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
import { loadsInPeriod, thresholdsFromSettings, withMetricsAll } from "@/lib/calculations";
import { getRepository } from "@/lib/db";
import {
  bestBroker,
  BROKER_SORTS,
  calculateBrokerPerformance,
  sortBrokers,
  weakestBroker,
  type BrokerSort,
} from "@/lib/finance/brokers";
import {
  formatMiles,
  formatMoney,
  formatMoneyCompact,
  formatPercent,
  formatRateValue,
} from "@/lib/formatters";
import { loadsForTruck, orderedTrucks } from "@/lib/fleet";
import {
  param,
  periodFromSearchParams,
  scopeQuery,
  truckFromSearchParams,
  type SearchParams,
} from "@/lib/period-params";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Broker Scorecard" };

const SORT_KEYS = BROKER_SORTS.map((s) => s.key);

/**
 * BROKER SCORECARD.
 *
 * Ranked however the owner asks, but every row carries both axes: what the
 * broker produced in total, and what they paid per mile driven. A broker can
 * top the revenue column and still be the worst per mile.
 */
export default async function BrokersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const session = await requireSession();
  const { trucks, loads: allLoads, settings } = await getRepository(
    session.businessId,
  ).getDataset();
  const period = periodFromSearchParams(params);

  const truckId = truckFromSearchParams(params, trucks);
  const loads = loadsForTruck(allLoads, truckId);

  const sortParam = param(params, "sort") as BrokerSort;
  const sort: BrokerSort = SORT_KEYS.includes(sortParam) ? sortParam : "profit";

  const thresholds = thresholdsFromSettings(settings);
  const periodLoads = withMetricsAll(loadsInPeriod(loads, period), thresholds);
  const brokers = calculateBrokerPerformance(periodLoads, thresholds);
  const ranked = sortBrokers(brokers, sort);

  const best = bestBroker(brokers);
  const weakest = weakestBroker(brokers);
  const query = scopeQuery(period, truckId);

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title="Broker Scorecard"
        description="Which brokers are actually making you money, measured on the miles they cost you."
      />
      <AnalyticsTabs />
      <div className="flex flex-wrap items-center gap-2">
        <PeriodControls period={period} />
        <TruckSwitcher trucks={orderedTrucks(trucks)} selectedId={truckId} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat label="Brokers" value={String(brokers.length)} sub={period.shortLabel} />
        <MiniStat
          label="Strongest profit / mile"
          value={best ? formatRateValue(best.profitPerMile) : "—"}
          sub={best?.broker ?? "Not enough loads"}
          tone="info"
        />
        <MiniStat
          label="Weakest profit / mile"
          value={weakest ? formatRateValue(weakest.profitPerMile) : "—"}
          sub={weakest?.broker ?? "Not enough loads"}
        />
        <MiniStat
          label="Loads with no broker"
          value={String(brokers.find((b) => b.broker === "No broker")?.loadCount ?? 0)}
          sub="direct or unrecorded"
        />
      </div>

      <Card>
        <CardHeader className="flex-wrap">
          <CardTitle>Ranking</CardTitle>
          <nav className="flex flex-wrap gap-1" aria-label="Sort brokers">
            {BROKER_SORTS.map((option) => (
              <Link
                key={option.key}
                href={`/analytics/brokers?${query}&sort=${option.key}`}
                aria-current={option.key === sort ? "true" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1 text-2xs font-medium transition-colors focus-ring",
                  option.key === sort
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {option.label}
              </Link>
            ))}
          </nav>
        </CardHeader>
        <CardContent className="p-0">
          {ranked.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No loads in {period.label}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Broker</TableHead>
                    <TableHead className="text-right">Loads</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Miles</TableHead>
                    <TableHead className="text-right">Gross $/mi</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right">Profit $/mi</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead className="text-right">Deadhead</TableHead>
                    <TableHead className="text-right">Rating</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranked.map((broker) => (
                    <TableRow key={broker.broker}>
                      <TableCell className="font-medium">
                        <span className="block truncate">{broker.broker}</span>
                        {broker.outstanding > 0 ? (
                          <span className="text-2xs text-warn tnum">
                            {formatMoney(broker.outstanding)} outstanding
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tnum">{broker.loadCount}</TableCell>
                      <TableCell className="text-right tnum">
                        {formatMoneyCompact(broker.revenue)}
                      </TableCell>
                      <TableCell className="text-right tnum">
                        {formatMiles(broker.totalMiles)}
                      </TableCell>
                      <TableCell className="text-right tnum">
                        {formatRateValue(broker.averageGrossPerTotalMile)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tnum font-medium",
                          broker.tripProfit >= 0 ? "text-pos" : "text-neg",
                        )}
                      >
                        {formatMoneyCompact(broker.tripProfit)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tnum font-semibold",
                          broker.profitPerMile >= 0 ? "text-pos" : "text-neg",
                        )}
                      >
                        {formatRateValue(broker.profitPerMile)}
                      </TableCell>
                      <TableCell className="text-right tnum">
                        {formatPercent(broker.averageMargin)}
                      </TableCell>
                      <TableCell className="text-right tnum">
                        {formatPercent(broker.deadheadPct)}
                      </TableCell>
                      <TableCell className="text-right">
                        {broker.qualified ? (
                          <RatingBadge rating={broker.rating} />
                        ) : (
                          <span className="text-2xs text-muted-foreground">1 load</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-2xs leading-relaxed text-muted-foreground">
        Profit here is trip profit: gross rate less the fuel, tolls, dispatch, factoring and other
        costs recorded on each load, over every mile including deadhead. The ranking default is
        total profit — who produced the most money — while the rating is per mile, which is what
        decides whether their next load is worth taking.
      </p>
    </div>
  );
}
