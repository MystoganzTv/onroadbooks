import type { Metadata } from "next";
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
import { loadsInPeriod, thresholdsFromSettings, withMetricsAll } from "@/lib/calculations";
import { getRepository } from "@/lib/db";
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

export const metadata: Metadata = { title: "Lane Intelligence" };

/**
 * LANE INTELLIGENCE.
 *
 * State to state and directional: VA → NJ is a different business from
 * NJ → VA, and averaging them together hides exactly the thing worth knowing.
 * Nothing is ranked until a lane has run enough times to mean something.
 */
export default async function LanesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const session = await requireSession();
  const { trucks, loads: allLoads, settings, subscription } = await getRepository(
    session.businessId,
  ).getDataset();
  const period = periodFromSearchParams(params);

  if (!planAllows(subscription, "cockpit")) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <PageHeader
          title="Lanes"
          description="Which state-to-state runs actually pay, in the direction you ran them."
        />
        <PlanGate
          capability="cockpit"
          what="See which lanes pay and which ones only look busy — directional, and never ranked on a sample too thin to mean anything."
        />
      </div>
    );
  }

  const truckId = truckFromSearchParams(params, trucks);
  const loads = loadsForTruck(allLoads, truckId);

  const thresholds = thresholdsFromSettings(settings);
  const periodLoads = withMetricsAll(loadsInPeriod(loads, period), thresholds);
  const lanes = calculateLanePerformance(periodLoads, thresholds);

  const qualified = lanes.filter((l) => l.qualified);
  const emerging = lanes.filter((l) => !l.qualified);
  const bestPerMile = lanes.reduce((best, lane) => Math.max(best, lane.profitPerMile), 0);

  // A round trip only reads as a round trip when both directions are ranked.
  const pairs = qualified
    .map((lane) => {
      const reverse = qualified.find(
        (other) =>
          other.originState === lane.destinationState &&
          other.destinationState === lane.originState,
      );
      return reverse && lane.key < reverse.key ? { out: lane, back: reverse } : null;
    })
    .filter((pair): pair is { out: (typeof qualified)[number]; back: (typeof qualified)[number] } =>
      Boolean(pair),
    );

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title="Lane Intelligence"
        description="Which runs pay. Direction matters — the way out and the way back are separate businesses."
      />
      <AnalyticsTabs />
      <div className="flex flex-wrap items-center gap-2">
        <PeriodControls period={period} />
        <TruckSwitcher trucks={orderedTrucks(trucks)} selectedId={truckId} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat label="Lanes run" value={String(lanes.length)} sub={period.shortLabel} />
        <MiniStat label="Ranked" value={String(qualified.length)} sub={`${LANE_MIN_LOADS}+ loads`} />
        <MiniStat
          label="Best lane"
          value={qualified[0] ? formatRateValue(qualified[0].profitPerMile) : "—"}
          sub={qualified[0]?.label ?? "Not enough data"}
          tone="info"
        />
        <MiniStat
          label="Weakest lane"
          value={
            qualified.length > 1
              ? formatRateValue(qualified[qualified.length - 1].profitPerMile)
              : "—"
          }
          sub={qualified.length > 1 ? qualified[qualified.length - 1].label : "Not enough data"}
        />
      </div>

      {pairs.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Round trips</CardTitle>
            <span className="text-2xs text-muted-foreground">
              The same two states, each direction priced separately
            </span>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 lg:grid-cols-2">
            {pairs.map((pair) => (
              <div
                key={pair.out.key}
                className="rounded-md border border-border bg-surface-sunken/50 p-3"
              >
                <p className="text-xs font-medium text-foreground">
                  {pair.out.originState} ↔ {pair.out.destinationState}
                </p>
                <div className="mt-2 space-y-1.5">
                  <Direction lane={pair.out} />
                  <Direction lane={pair.back} />
                </div>
                <p className="mt-2 text-2xs text-muted-foreground tnum">
                  {formatRateValue(Math.abs(pair.out.profitPerMile - pair.back.profitPerMile))} per
                  mile difference between the two directions.
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>All lanes</CardTitle>
          <span className="text-2xs text-muted-foreground">Best profit per mile first</span>
        </CardHeader>
        <CardContent className="p-0">
          {lanes.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No loads in {period.label}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lane</TableHead>
                    <TableHead className="text-right">Loads</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Miles</TableHead>
                    <TableHead className="text-right">Rate $/loaded mi</TableHead>
                    <TableHead className="text-right">Profit $/mi</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead className="text-right">Deadhead</TableHead>
                    <TableHead className="w-28">Relative</TableHead>
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
                            {LANE_MIN_LOADS - lane.loadCount} more to rank
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
                          title={`${formatRateValue(lane.profitPerMile)} per mile`}
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
          ? `${emerging.length} ${
              emerging.length === 1
                ? "lane has fewer than"
                : "lanes have fewer than"
            } ${LANE_MIN_LOADS} loads and ${
              emerging.length === 1 ? "is" : "are"
            } shown greyed out rather than ranked. `
          : ""}
        A lane needs {LANE_MIN_LOADS} loads before it is ranked — two runs is an anecdote, and a
        ranking built on anecdotes is worse than none. Lanes are grouped state to state for now;
        city and market level grouping comes later.
      </p>
    </div>
  );
}

function Direction({ lane }: { lane: { label: string; loadCount: number; profitPerMile: number } }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-1 text-2xs text-muted-foreground">
        <ArrowRight className="size-3 shrink-0" />
        <span className="truncate">
          {lane.label} · {lane.loadCount} loads
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
