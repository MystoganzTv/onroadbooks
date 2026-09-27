"use client";

import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/components/shell/language-provider";
import { tripExpenseLines } from "@/lib/calculations";
import { formatMiles, formatMoney, formatPercent, formatRateValue } from "@/lib/formatters";
import type { TripCostEstimate } from "@/lib/load-estimates";
import type { Expense, Load, LoadMetrics } from "@/lib/types";
import { cn } from "@/lib/utils";
import { RatingVerdict } from "./rating-badge";
import { formatLocaleNumber } from "@/lib/i18n-format";
import { interpolate } from "@/lib/i18n/dictionaries";

/**
 * The trip cost waterfall: gross rate at the top, every cost taken off it in
 * order, profit at the bottom. Bar widths are proportional to the gross rate
 * so the size of each bite is legible at a glance, not just its number.
 */
export function TripWaterfall({
  load,
  metrics,
  expenses = [],
  estimate = {},
}: {
  load: Load;
  metrics: LoadMetrics;
  expenses?: Expense[];
  /** Fuel and driver pay the load does not record yet; see load-estimates.ts. */
  estimate?: TripCostEstimate;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.loads;
  const lines = tripExpenseLines(load, expenses, estimate);
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
                label={line.key === "fuel"
                  ? copy.tripFuel
                  : line.label}
                hint={line.key === "fuel"
                  ? line.estimated && estimate.fuelSource === "MPG" && estimate.fuelMpg && estimate.fuelPricePerGallon
                    ? interpolate(copy.fuelEstimateMpgHint, {
                      miles: formatMiles(metrics.totalMiles),
                      mpg: String(estimate.fuelMpg),
                      price: `$${estimate.fuelPricePerGallon}`,
                    })
                    : line.estimated && estimate.fuelPerMile
                    ? interpolate(copy.fuelEstimateRateHint, {
                      miles: formatMiles(metrics.totalMiles),
                      rate: formatRateValue(estimate.fuelPerMile),
                    })
                    : copy.fuelEstimateHint
                  : undefined}
                detail={line.key === "fuel" && line.estimated ? (
                  <FuelCalculation load={load} estimate={estimate} amount={line.amount} />
                ) : undefined}
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
  detail,
}: {
  label: string;
  hint?: string;
  detail?: ReactNode;
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
      {detail}
    </div>
  );
}

function FuelCalculation({ load, estimate, amount }: { load: Load; estimate: TripCostEstimate; amount: number }) {
  const { dictionary, locale } = useLanguage();
  const copy = dictionary.loads;
  const number = (value: number, digits = 20) => formatLocaleNumber(value, locale, {
    maximumFractionDigits: digits,
  });
  const miles = load.loadedMiles + load.deadheadMiles;
  const byGallon = Boolean(estimate.fuelSource === "MPG" && estimate.fuelMpg && estimate.fuelPricePerGallon);
  if (!byGallon && !estimate.fuelPerMile) return null;

  return (
    <details className="mt-2 rounded-md border border-border bg-surface-sunken text-sm" data-testid="fuel-calculation">
      <summary className="cursor-pointer rounded-md px-3 py-2 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {copy.fuelCalculation}
      </summary>
      <div className="space-y-3 border-t border-border p-3">
        <dl className="space-y-3 [&_dt]:text-xs [&_dt]:text-muted-foreground [&_dd]:mt-1 [&_dd]:break-words [&_dd]:font-medium [&_dd]:tabular-nums">
          <div>
            <dt>{copy.fuelCalculationMiles}</dt>
            <dd>{number(load.loadedMiles)} + {number(load.deadheadMiles)} = {number(miles)} mi</dd>
          </div>
          {byGallon ? <>
            <div>
              <dt>{copy.fuelCalculationGallons}</dt>
              <dd>{number(miles)} mi ÷ {number(estimate.fuelMpg!)} MPG ≈ {number(miles / estimate.fuelMpg!, 4)} gal</dd>
            </div>
            <div>
              <dt>{copy.fuelCalculationPrice}</dt>
              <dd>${number(estimate.fuelPricePerGallon!)} / gal</dd>
            </div>
          </> : null}
          <div>
            <dt>{copy.fuelCalculationTotal}</dt>
            <dd>{byGallon
              ? `${number(miles)} ÷ ${number(estimate.fuelMpg!)} × $${number(estimate.fuelPricePerGallon!)} = ${formatMoney(amount)}`
              : `${number(miles)} mi × $${number(estimate.fuelPerMile!)} / mi = ${formatMoney(amount)}`}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">{byGallon
          ? estimate.fuelPriceSource === "LATEST" && estimate.fuelPriceDate
            ? interpolate(copy.fuelCalculationLatest, { date: estimate.fuelPriceDate })
            : estimate.fuelPriceSource === "AVERAGE" ? copy.fuelCalculationAverage : null
          : copy.fuelCalculationLedger}</p>
        <p className="text-xs text-muted-foreground">{copy.fuelCalculationNote}</p>
      </div>
    </details>
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
