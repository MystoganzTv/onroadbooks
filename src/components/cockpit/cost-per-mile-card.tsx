import Link from "next/link";
import { Gauge } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { categoryColor } from "@/lib/categories";
import { formatMoney, formatRateValue } from "@/lib/formatters";
import type { CostPerMile } from "@/lib/finance/cost-per-mile";
import { cn } from "@/lib/utils";

interface CostPerMileCardProps {
  cost: CostPerMile;
  /** Revenue per mile, so the card can show what the mile actually returned. */
  revenuePerMile?: number;
  href?: string;
  compact?: boolean;
  className?: string;
}

/**
 * TRUE COST PER MILE.
 *
 * Fixed and variable split, then every dollar of it accounted for by
 * category. Shown as one stacked bar so "where does a mile's money go" is a
 * shape, not a column of numbers.
 */
export function CostPerMileCard({
  cost,
  revenuePerMile,
  href,
  compact = false,
  className,
}: CostPerMileCardProps) {
  if (!cost.sufficient) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Gauge className="size-3.5 text-muted-foreground" />
            <CardTitle>{compact ? "Normalized Cost / Mile" : "Actual Cost / Mile"}</CardTitle>
          </div>
          {/*
            The basis belongs in the header even when the card is empty: two of
            these sit side by side -- this period and the trailing basis -- and
            without it they read as the same card twice. It is a label, not a
            phrase, so it is shown as one instead of being spliced into the
            sentence below ("Trailing 90 days" reads fine there, "No data yet"
            does not).
          */}
          <span className="text-2xs text-muted-foreground">{cost.basisLabel}</span>
        </CardHeader>
        <CardContent className="p-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            No miles recorded for this basis, so there is nothing to divide costs by yet. Add
            a load with miles and this fills in.
          </p>
        </CardContent>
      </Card>
    );
  }

  const margin = revenuePerMile !== undefined ? revenuePerMile - cost.actualCostPerMile : undefined;

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Gauge className="size-3.5 text-muted-foreground" />
          <CardTitle>{compact ? "Normalized Cost / Mile" : "Actual Cost / Mile"}</CardTitle>
        </div>
        <span className="text-2xs text-muted-foreground">{cost.basisLabel}</span>
      </CardHeader>

      <CardContent className="space-y-3.5 p-4">
        <div className="flex items-end justify-between gap-4">
          <div className="grid flex-1 grid-cols-2 gap-3">
            <Split label="Fixed / mile" value={cost.fixedCostPerMile} tone="text-info" />
            <Split label="Variable / mile" value={cost.variableCostPerMile} tone="text-warn" />
          </div>
          <div className="shrink-0 text-right">
            <p className="label-xs">{compact ? "Normalized cost / mile" : "Actual cost / mile"}</p>
            <p className="mt-0.5 tnum text-3xl font-semibold leading-none tracking-tight text-foreground">
              {formatRateValue(cost.actualCostPerMile)}
            </p>
          </div>
        </div>

        {/* Every dollar of a mile, in one bar. */}
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-sunken">
          {cost.lines.map((line) => (
            <span
              key={line.category}
              className="h-full"
              style={{ width: `${line.share}%`, backgroundColor: categoryColor(line.category) }}
              title={`${line.label}: ${formatRateValue(line.perMile)}/mi`}
            />
          ))}
        </div>

        {!compact ? (
          <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
            {cost.lines.slice(0, 8).map((line) => (
              <li key={line.category} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: categoryColor(line.category) }}
                    aria-hidden
                  />
                  <span className="truncate text-2xs text-muted-foreground">{line.label}</span>
                </span>
                <span className="shrink-0 tnum text-2xs text-foreground">
                  {formatRateValue(line.perMile)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-2xs text-muted-foreground">
          <span className="tnum">
            {formatMoney(cost.totalCost)} over {Math.round(cost.totalMiles).toLocaleString()} mi
          </span>
          {margin !== undefined ? (
            <span
              className={cn("tnum font-medium", margin >= 0 ? "text-pos" : "text-neg")}
            >
              {margin >= 0 ? "Keeping" : "Losing"} {formatRateValue(Math.abs(margin))} per mile
            </span>
          ) : null}
        </div>

        {cost.debtServiceTotal > 0 ? (
          <p className="border-t border-border pt-3 text-2xs text-muted-foreground tnum">
            Debt Service is separate: {formatMoney(cost.debtServiceTotal)} · {formatRateValue(cost.debtServicePerMile)}/mi cash burden.
          </p>
        ) : null}

        {href ? (
          <Link
            href={href}
            className="inline-block text-2xs font-medium text-primary underline-offset-2 hover:underline focus-ring"
          >
            See the full cost-per-mile breakdown
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Split({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <p className="label-xs truncate">{label}</p>
      <p className={cn("mt-0.5 tnum text-lg font-semibold tracking-tight", tone)}>
        {formatRateValue(value)}
      </p>
    </div>
  );
}
