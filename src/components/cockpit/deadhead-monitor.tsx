"use client";

import { Route } from "lucide-react";

import { useLanguage } from "@/components/shell/language-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney, formatNumber, formatPercent, formatRateValue } from "@/lib/formatters";
import type { DeadheadReport } from "@/lib/finance/deadhead";
import { interpolate } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

/**
 * DEADHEAD MONITOR.
 *
 * Empty miles as a first-class metric: the split, the percentage against the
 * owner's own ceiling, what those miles cost at the truck's Actual Cost Per
 * mile, and what they would have earned loaded. The language is factual --
 * repositioning to a better market is a decision, not a failure.
 */
export function DeadheadMonitor({
  report,
  className,
}: {
  report: DeadheadReport;
  className?: string;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.dashboard;
  const loadedShare = report.totalMiles > 0 ? (report.loadedMiles / report.totalMiles) * 100 : 0;

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Route className="size-3.5 text-muted-foreground" />
          <CardTitle>{copy.deadhead}</CardTitle>
        </div>
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 text-2xs font-semibold tnum",
            report.elevated
              ? "border-warn/40 bg-warn-soft text-warn"
              : "border-pos/40 bg-pos-soft text-pos",
          )}
        >
          {interpolate(copy.warningThreshold, {
            actual: formatPercent(report.deadheadPct),
            threshold: formatPercent(report.warnPct, 0),
          })}
        </span>
      </CardHeader>

      <CardContent className="space-y-3.5 p-4">
        <div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-sunken">
            <span className="h-full bg-info" style={{ width: `${loadedShare}%` }} />
            <span className="h-full bg-warn" style={{ width: `${100 - loadedShare}%` }} />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Stat label={copy.loaded} value={`${formatNumber(report.loadedMiles)} mi`} tone="text-info" />
            <Stat
              label={copy.deadhead}
              value={`${formatNumber(report.deadheadMiles)} mi`}
              tone="text-warn"
            />
            <Stat label={copy.total} value={`${formatNumber(report.totalMiles)} mi`} />
          </div>
        </div>

        <div className="rounded-md border border-border bg-surface-sunken/60 p-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-2xs uppercase tracking-wide text-muted-foreground">
              {copy.estimatedDeadheadCost}
            </span>
            <span className="tnum text-xl font-semibold tracking-tight text-warn">
              {formatMoney(report.cost)}
            </span>
          </div>
          <p className="mt-1 text-2xs text-muted-foreground tnum">
            {interpolate(copy.trueCostFormula, {
              miles: formatNumber(report.deadheadMiles),
              rate: formatRateValue(report.costPerMile),
            })}
          </p>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {report.deadheadMiles > 0
            ? interpolate(copy.deadheadMilesStatement, { miles: formatNumber(report.deadheadMiles) })
            : copy.allMilesLoaded}
        </p>

        <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3">
          <Pair
            label={copy.opportunityRevenue}
            value={formatMoney(report.opportunityRevenue)}
          />
          <Pair
            label={copy.rateDilution}
            value={`${formatRateValue(report.rateDilution)}/mi`}
          />
        </dl>

        {report.goalPct !== null ? (
          <p className="text-2xs text-muted-foreground">
            {report.deadheadPct <= report.goalPct
              ? interpolate(copy.insideDeadheadCeiling, {
                  percent: formatPercent(report.goalPct, 0),
                })
              : interpolate(copy.milesToDeadheadGoal, {
                  miles: formatNumber(report.milesToGoal),
                  percent: formatPercent(report.goalPct, 0),
                })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="label-xs truncate">{label}</p>
      <p className={cn("mt-0.5 tnum text-md font-semibold tracking-tight", tone)}>{value}</p>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 tnum text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}
