import Link from "next/link";
import { Map } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoneyCompact, formatPercent, formatRateValue } from "@/lib/formatters";
import type { LanePerformance } from "@/lib/finance/lanes";
import { cn } from "@/lib/utils";

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
  const qualified = lanes.filter((l) => l.qualified);
  const best = qualified.slice(0, limit);
  const worst = qualified.length > limit ? qualified.slice(-2).reverse() : [];
  const emerging = lanes.filter((l) => !l.qualified).length;

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Map className="size-3.5 text-muted-foreground" />
          <CardTitle>Lanes</CardTitle>
        </div>
        {href ? (
          <Link
            href={href}
            className="text-2xs font-medium text-primary underline-offset-2 hover:underline focus-ring"
          >
            All lanes
          </Link>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        {qualified.length === 0 ? (
          <p className="p-4 text-xs leading-relaxed text-muted-foreground">
            No lane has been run {minLoads} times yet in this period, so there is nothing worth
            ranking. {emerging > 0 ? `${emerging} building.` : ""}
          </p>
        ) : (
          <>
            <LaneGroup title="Best lanes" lanes={best} tone="pos" />
            {worst.length > 0 ? (
              <LaneGroup title="Weakest lanes" lanes={worst} tone="neg" />
            ) : null}
            {emerging > 0 ? (
              <p className="border-t border-border px-4 py-2 text-2xs text-muted-foreground">
                {emerging} more {emerging === 1 ? "lane needs" : "lanes need"} {minLoads} loads
                before they are ranked.
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
                {lane.loadCount} loads · {formatMoneyCompact(lane.revenue)} ·{" "}
                {formatRateValue(lane.revenuePerLoadedMile)}/loaded mi ·{" "}
                {formatPercent(lane.deadheadPct, 0)} deadhead
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
