import Link from "next/link";
import { ArrowRight, Target } from "lucide-react";

import { RATING_STYLE } from "@/components/loads/rating-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatMoney, formatPercent, formatRateValue } from "@/lib/formatters";
import type { LoadWithMetrics, ProfitabilityRating } from "@/lib/types";
import { cn } from "@/lib/utils";

interface LoadQualityCardProps {
  breakdown: { rating: ProfitabilityRating; count: number; revenue: number; share: number }[];
  /** The loads dragging the period down, worst first. */
  worst: LoadWithMetrics[];
  periodQuery: string;
}

/** Answers "which loads are making me money" and "where am I losing money". */
export function LoadQualityCard({ breakdown, worst, periodQuery }: LoadQualityCardProps) {
  const total = breakdown.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Target className="size-3.5 text-muted-foreground" />
          <CardTitle>Load Quality</CardTitle>
        </div>
        <span className="text-2xs text-muted-foreground tnum">
          {total} {total === 1 ? "load" : "loads"} rated
        </span>
      </CardHeader>

      {total === 0 ? (
        <EmptyState
          icon={Target}
          title="No loads to rate"
          description="Ratings compare profit per total mile against your thresholds in Settings."
          compact
        />
      ) : (
        <CardContent className="space-y-4 p-4">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-sunken">
            {breakdown.map((item) =>
              item.share > 0 ? (
                <div
                  key={item.rating}
                  className={RATING_STYLE[item.rating].dot}
                  style={{ width: `${item.share}%` }}
                  aria-hidden
                />
              ) : null,
            )}
          </div>

          <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {breakdown.map((item) => (
              <li key={item.rating} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={cn("size-2 shrink-0 rounded-[2px]", RATING_STYLE[item.rating].dot)}
                    aria-hidden
                  />
                  <span className="truncate">{RATING_STYLE[item.rating].label}</span>
                </span>
                <span className="shrink-0 tnum text-muted-foreground">
                  {item.count} - {formatPercent(item.share, 0)}
                </span>
              </li>
            ))}
          </ul>

          {worst.length > 0 ? (
            <div className="border-t border-border pt-3">
              <p className="label-xs">Weakest loads this period</p>
              <ul className="mt-2 space-y-1.5">
                {worst.map((load) => (
                  <li key={load.id} className="flex items-baseline justify-between gap-3 text-xs">
                    <Link
                      href={`/loads/${load.id}`}
                      className="min-w-0 truncate hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {load.originCity} to {load.destinationCity}
                      <span className="ml-1.5 text-muted-foreground">
                        - {load.broker ?? "No broker"}
                      </span>
                    </Link>
                    <span className="flex shrink-0 items-baseline gap-2 tnum">
                      <span className={RATING_STYLE[load.metrics.rating].text}>
                        {formatRateValue(load.metrics.profitPerMile)}/mi
                      </span>
                      <span className="w-[4.25rem] text-right text-muted-foreground">
                        {formatMoney(load.metrics.tripProfit)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <Button asChild variant="outline" size="sm" className="w-full">
            <Link href={`/loads?${periodQuery}`}>
              Review every load
              <ArrowRight />
            </Link>
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
