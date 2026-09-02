"use client";

import Link from "next/link";
import { Map } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/components/shell/language-provider";
import { formatMoneyCompact, formatPercent, formatRateValue } from "@/lib/formatters";
import type { LanePerformance } from "@/lib/finance/lanes";
import { cn } from "@/lib/utils";
import { interpolate } from "@/lib/i18n/dictionaries";

/**
 * Lane intelligence, state to state and DIRECTIONAL -- VA to NJ is not the
 * same business as NJ to VA. A lane is not ranked until it has run enough
 * times to mean something; until then it is listed as still building.
 */
export function LanePanel({
  lanes,
  minLoads,
  href,
  limit = 4,
  className,
}: {
  lanes: LanePerformance[];
  minLoads: number;
  href?: string;
  limit?: number;
  className?: string;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.analytics;
  const qualified = lanes.filter((l) => l.qualified);
  const best = qualified.slice(0, limit);
  const worst = qualified.length > limit ? qualified.slice(-2).reverse() : [];
  const emerging = lanes.filter((l) => !l.qualified).length;

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Map className="size-3.5 text-muted-foreground" />
          <CardTitle>{copy.lanesTab}</CardTitle>
        </div>
        {href ? (
          <Link
            href={href}
            className="text-2xs font-medium text-primary underline-offset-2 hover:underline focus-ring"
          >
            {copy.allLanesLink}
          </Link>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        {qualified.length === 0 ? (
          <p className="p-4 text-xs leading-relaxed text-muted-foreground">
            {interpolate(copy.noRankedLane, {
              count: minLoads,
              emerging: emerging > 0 ? interpolate(copy.building, { count: emerging }) : "",
            })}
          </p>
        ) : (
          <>
            <LaneGroup title={copy.bestLanes} lanes={best} tone="pos" />
            {worst.length > 0 ? (
              <LaneGroup title={copy.weakestLanes} lanes={worst} tone="neg" />
            ) : null}
            {emerging > 0 ? (
              <p className="border-t border-border px-4 py-2 text-2xs text-muted-foreground">
                {interpolate(copy.moreLanesNeed, {
                  count: emerging,
                  verb: emerging === 1 ? copy.laneNeeds : copy.lanesNeed,
                  minimum: minLoads,
                })}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LaneGroup({
  title,
  lanes,
  tone,
}: {
  title: string;
  lanes: LanePerformance[];
  tone: "pos" | "neg";
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.analytics;
  return (
    <div className="border-t border-border first:border-t-0">
      <p className="px-4 pt-2.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="divide-y divide-border/70">
        {lanes.map((lane) => (
          <li key={lane.key} className="flex items-center justify-between gap-3 px-4 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">{lane.label}</p>
              <p className="truncate text-2xs text-muted-foreground tnum">
                {interpolate(copy.laneRow, {
                  count: lane.loadCount,
                  revenue: formatMoneyCompact(lane.revenue),
                  rate: formatRateValue(lane.revenuePerLoadedMile),
                  deadhead: formatPercent(lane.deadheadPct, 0),
                })}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 tnum text-sm font-semibold",
                tone === "pos" ? "text-pos" : "text-neg",
              )}
            >
              {formatRateValue(lane.profitPerMile)}/mi
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
