import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { AnalyticsTabs } from "@/components/cockpit/analytics-tabs";
import { TruckSwitcher } from "@/components/fleet/truck-switcher";
import { PeriodControls } from "@/components/dashboard/period-controls";
import { MiniStat } from "@/components/dashboard/mini-stat";
import { PageHeader } from "@/components/shared/page-header";
import { PlanGate } from "@/components/shared/plan-gate";
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
import { linkedFuelByLoad, loadsInPeriod, thresholdsFromSettings, withMetricsAll } from "@/lib/calculations";
import { getDataset } from "@/lib/db";
import { calculateLanePerformance, LANE_MIN_LOADS } from "@/lib/finance/lanes";
import {
  formatMiles,
  formatMoneyCompact,
  formatPercent,
  formatRateValue,
} from "@/lib/formatters";
import { loadsForTruck, orderedTrucks } from "@/lib/fleet";
import { planAllows } from "@/lib/plans";
import {
  periodFromSearchParams,
  truckFromSearchParams,
  type SearchParams,
} from "@/lib/period-params";
import { cn } from "@/lib/utils";
import { getWebDictionary, interpolate, type WebDictionary } from "@/lib/i18n/dictionaries";
import { getAppLocale } from "@/lib/i18n-server";
import { formatLocalePeriod } from "@/lib/i18n-format";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).analytics.laneMetadata };
}

/**
 * LANE INTELLIGENCE.
 *
 * Market to market and directional: Richmond → North Jersey is a different business from
 * NJ → VA, and averaging them together hides exactly the thing worth knowing.
 * Nothing is ranked until a lane has run enough times to mean something.
 */
export default async function LanesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [params, session, locale] = await Promise.all([
    searchParams,
    requireSession(),
    getAppLocale(),
  ]);
  const copy = getWebDictionary(locale).analytics;
  const { trucks, loads: allLoads, fuelEntries, settings, subscription } = await getDataset(
    session.businessId,
  );
  const period = periodFromSearchParams(params);
  const grouping = (Array.isArray(params.group) ? params.group[0] : params.group) === "state"
    ? "state"
    : "market";

  if (!planAllows(subscription, "cockpit")) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <PageHeader
          title={copy.laneGateTitle}
          description={copy.laneGateDescription}
        />
        <PlanGate
          capability="cockpit"
          what={copy.laneGateWhat}
        />
      </div>
    );
  }

  const truckId = truckFromSearchParams(params, trucks);
  const loads = loadsForTruck(allLoads, truckId);

  const thresholds = thresholdsFromSettings(settings);
  const periodLoads = withMetricsAll(
    loadsInPeriod(loads, period),
    thresholds,
    linkedFuelByLoad(fuelEntries),
  );
  const lanes = calculateLanePerformance(periodLoads, thresholds, LANE_MIN_LOADS, grouping);

  const qualified = lanes.filter((l) => l.qualified);
  const emerging = lanes.filter((l) => !l.qualified);
  const bestPerMile = lanes.reduce((best, lane) => Math.max(best, lane.profitPerMile), 0);
  const periodLabel = formatLocalePeriod(period, locale);
  const periodShort = formatLocalePeriod(period, locale, "short");

  // A round trip only reads as a round trip when both directions are ranked.
  const pairs = qualified
    .map((lane) => {
      const reverse = qualified.find(
        (other) =>
          other.originKey === lane.destinationKey &&
          other.destinationKey === lane.originKey,
      );
      return reverse && lane.key < reverse.key ? { out: lane, back: reverse } : null;
    })
    .filter((pair): pair is { out: (typeof qualified)[number]; back: (typeof qualified)[number] } =>
      Boolean(pair),
    );

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title={copy.laneTitle}
        description={copy.laneDescription}
      />
      <AnalyticsTabs />
      <div className="flex flex-wrap items-center gap-2">
        <PeriodControls period={period} />
        <TruckSwitcher trucks={orderedTrucks(trucks)} selectedId={truckId} />
        <div className="flex rounded-md border border-border bg-surface-sunken p-0.5 text-xs">
          {(["market", "state"] as const).map((option) => {
            const query = new URLSearchParams();
            for (const [key, value] of Object.entries(params)) {
              const first = Array.isArray(value) ? value[0] : value;
              if (first && key !== "group") query.set(key, first);
            }
            query.set("group", option);
            return (
              <Link
                key={option}
                href={`/analytics/lanes?${query.toString()}`}
                className={cn(
                  "rounded px-2.5 py-1.5 capitalize",
                  grouping === option && "bg-background font-medium text-foreground shadow-sm",
                )}
              >
                {option === "market" ? copy.market : copy.state}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat label={copy.lanesRun} value={String(lanes.length)} sub={periodShort} />
        <MiniStat label={copy.ranked} value={String(qualified.length)} sub={interpolate(copy.minimumLoads, { count: LANE_MIN_LOADS })} />
        <MiniStat
          label={copy.bestLane}
          value={qualified[0] ? formatRateValue(qualified[0].profitPerMile) : "—"}
          sub={qualified[0]?.label ?? copy.notEnoughData}
          tone="info"
        />
        <MiniStat
          label={copy.weakestLane}
          value={
            qualified.length > 1
              ? formatRateValue(qualified[qualified.length - 1].profitPerMile)
              : "—"
          }
          sub={qualified.length > 1 ? qualified[qualified.length - 1].label : copy.notEnoughData}
        />
      </div>

      {pairs.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{copy.roundTrips}</CardTitle>
            <span className="text-2xs text-muted-foreground">
              {interpolate(copy.roundTripDescription, {
                group: grouping === "market" ? copy.markets : copy.states,
              })}
            </span>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 lg:grid-cols-2">
            {pairs.map((pair) => (
              <div
                key={pair.out.key}
                className="rounded-md border border-border bg-surface-sunken/50 p-3"
              >
                <p className="text-xs font-medium text-foreground">
                  {pair.out.originLabel} ↔ {pair.out.destinationLabel}
                </p>
                <div className="mt-2 space-y-1.5">
                  <Direction lane={pair.out} copy={copy} />
                  <Direction lane={pair.back} copy={copy} />
                </div>
                <p className="mt-2 text-2xs text-muted-foreground tnum">
                  {interpolate(copy.directionDifference, {
                    rate: formatRateValue(Math.abs(pair.out.profitPerMile - pair.back.profitPerMile)),
                  })}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{copy.allLanes}</CardTitle>
          <span className="text-2xs text-muted-foreground">{copy.bestFirst}</span>
        </CardHeader>
        <CardContent className="p-0">
          {lanes.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {interpolate(copy.noLoads, { period: periodLabel })}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{copy.lane}</TableHead>
                    <TableHead className="text-right">{copy.loads}</TableHead>
                    <TableHead className="text-right">{copy.bookedRevenue}</TableHead>
                    <TableHead className="text-right">{copy.miles}</TableHead>
                    <TableHead className="text-right">{copy.rateLoaded}</TableHead>
                    <TableHead className="text-right">{copy.contributionPerMile}</TableHead>
                    <TableHead className="text-right">{copy.contributionMargin}</TableHead>
                    <TableHead className="text-right">{copy.deadhead}</TableHead>
                    <TableHead className="w-28">{copy.relative}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lanes.map((lane) => (
                    <TableRow key={lane.key} className={lane.qualified ? undefined : "opacity-60"}>
                      <TableCell className="font-medium">{lane.label}</TableCell>
                      <TableCell className="text-right tnum">
                        {lane.loadCount}
                        {lane.qualified ? null : (
                          <span className="block text-2xs text-muted-foreground">
                            {interpolate(copy.moreToRank, {
                              count: LANE_MIN_LOADS - lane.loadCount,
                            })}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tnum">
                        {formatMoneyCompact(lane.revenue)}
                      </TableCell>
                      <TableCell className="text-right tnum">
                        {formatMiles(lane.totalMiles)}
                      </TableCell>
                      <TableCell className="text-right tnum">
                        {formatRateValue(lane.revenuePerLoadedMile)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tnum font-semibold",
                          lane.profitPerMile >= 0 ? "text-pos" : "text-neg",
                        )}
                      >
                        {formatRateValue(lane.profitPerMile)}
                      </TableCell>
                      <TableCell className="text-right tnum">
                        {formatPercent(lane.averageMargin)}
                      </TableCell>
                      <TableCell className="text-right tnum">
                        {formatPercent(lane.deadheadPct)}
                      </TableCell>
                      <TableCell>
                        {/* Lanes are judged against each other, not against a
                            threshold: a column of identical badges would say
                            nothing, while the bar shows the real spread. */}
                        <span
                          className="block h-2 overflow-hidden rounded-full bg-surface-sunken"
                          title={interpolate(copy.perMile, {
                            amount: formatRateValue(lane.profitPerMile),
                          })}
                        >
                          <span
                            className={cn(
                              "block h-full rounded-full",
                              lane.profitPerMile >= 0 ? "bg-info" : "bg-neg",
                            )}
                            style={{
                              width: `${
                                bestPerMile > 0
                                  ? Math.max(2, Math.min(100, (lane.profitPerMile / bestPerMile) * 100))
                                  : 2
                              }%`,
                            }}
                          />
                        </span>
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
        {emerging.length > 0
          ? interpolate(copy.emergingMethod, {
              count: emerging.length,
              unit: emerging.length === 1 ? copy.laneHas : copy.lanesHave,
              minimum: LANE_MIN_LOADS,
              verb: emerging.length === 1 ? copy.is : copy.are,
            })
          : ""}
        {interpolate(copy.laneMethod, { count: LANE_MIN_LOADS })}
      </p>
    </div>
  );
}

function Direction({ lane, copy }: { lane: { label: string; loadCount: number; profitPerMile: number }; copy: WebDictionary["analytics"] }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-1 text-2xs text-muted-foreground">
        <ArrowRight className="size-3 shrink-0" />
        <span className="truncate">
          {lane.label} · {lane.loadCount} {copy.loads.toLowerCase()}
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 tnum text-xs font-semibold",
          lane.profitPerMile >= 0 ? "text-pos" : "text-neg",
        )}
      >
        {formatRateValue(lane.profitPerMile)}/mi
      </span>
    </div>
  );
}
