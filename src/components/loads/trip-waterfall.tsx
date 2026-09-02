"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/components/shell/language-provider";
import { tripExpenseLines } from "@/lib/calculations";
import { formatMiles, formatMoney, formatPercent, formatRateValue } from "@/lib/formatters";
import type { Load, LoadMetrics } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RatingVerdict } from "./rating-badge";
import { interpolate } from "@/lib/i18n/dictionaries";

/**
 * The trip cost waterfall: gross rate at the top, every cost taken off it in
 * order, profit at the bottom. Bar widths are proportional to the gross rate
 * so the size of each bite is legible at a glance, not just its number.
 */
export function TripWaterfall({
  load,
  metrics,
  linkedFuelCost,
}: {
  load: Load;
  metrics: LoadMetrics;
  /**
   * Set when real fill-ups are linked to this load. Their total replaces the
   * fuel figure typed on the load, exactly as the expense ledger does, so the
   * waterfall and the ledger never disagree about the same trip.
   */
  linkedFuelCost?: number;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.loads;
  const lines = tripExpenseLines(load, linkedFuelCost);
  const fuelFromFillUps = linkedFuelCost !== undefined;
  const scale = (value: number) =>
    load.grossRate > 0 ? Math.max((Math.abs(value) / load.grossRate) * 100, 0.6) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.tripCostBreakdown}</CardTitle>
        <span className="text-2xs text-muted-foreground">
          {interpolate(copy.margin, { percent: formatPercent(metrics.profitMargin) })}
        </span>
      </CardHeader>

      <CardContent className="space-y-4 p-4">
        <div>
          <Row
            label={copy.grossRate}
            value={load.grossRate}
            width={100}
            barClass="bg-info"
            strong
          />

          <div className="mt-1 space-y-1">
            {lines.map((line) => (
              <Row
                key={line.key}
                label={line.label}
                hint={line.key === "fuel" && fuelFromFillUps ? copy.fromLinkedFillups : undefined}
                value={-line.amount}
                width={scale(line.amount)}
                barClass="bg-neg"
                muted={line.amount === 0}
              />
            ))}
          </div>

          <div className="my-2 border-t border-dashed border-border" />

          <Row
            label={copy.directTripCosts}
            value={-metrics.tripExpenses}
            width={scale(metrics.tripExpenses)}
            barClass="bg-neg"
          />

          <div className="my-2 border-t border-border" />

          <Row
            label={copy.contributionProfit}
            value={metrics.tripProfit}
            width={scale(metrics.tripProfit)}
            barClass={metrics.tripProfit >= 0 ? "bg-pos" : "bg-neg"}
            strong
          />
        </div>

        <div className="grid grid-cols-3 gap-3 rounded-md border border-border bg-surface-sunken px-3 py-2.5">
          <Summary label={copy.totalMiles} value={formatMiles(metrics.totalMiles)} />
          <Summary
            label={copy.contributionPerMile}
            value={`${formatRateValue(metrics.profitPerMile)}`}
            tone={metrics.profitPerMile >= 0 ? "pos" : "neg"}
          />
          <Summary label={copy.contributionMargin} value={formatPercent(metrics.profitMargin)} />
        </div>

        <RatingVerdict rating={metrics.rating} profitPerMile={metrics.profitPerMile} />
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  hint,
  value,
  width,
  barClass,
  strong,
  muted,
}: {
  label: string;
  hint?: string;
  value: number;
  width: number;
  barClass: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={cn("py-1", muted && "opacity-45")}>
      <div className="flex items-baseline justify-between gap-4">
        <span
          className={cn(
            "text-sm",
            strong ? "font-medium text-foreground" : "text-foreground/85",
          )}
        >
          {label}
          {hint ? (
            <span className="ml-1.5 text-2xs font-normal text-muted-foreground">{hint}</span>
          ) : null}
        </span>
        <span
          className={cn(
            "tnum text-sm",
            strong && "font-semibold",
            value < 0 && Math.abs(value) >= 0.005 ? "text-neg" : "text-foreground",
          )}
        >
          {value < 0 && Math.abs(value) >= 0.005
            ? `-${formatMoney(Math.abs(value))}`
            : formatMoney(Math.abs(value))}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
        <div
          className={cn("h-full rounded-full transition-all", barClass)}
          style={{ width: `${Math.min(width, 100)}%` }}
        />
      </div>
    </div>
  );
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
}) {
  return (
    <div>
      <p className="label-xs">{label}</p>
      <p
        className={cn(
          "mt-0.5 tnum text-xl font-semibold tracking-tight",
          tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}
