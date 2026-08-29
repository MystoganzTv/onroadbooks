import { Route, TriangleAlert } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DeadheadAnalysis } from "@/lib/calculations";
import {
  formatMoney,
  formatNumber,
  formatPercent,
  formatRate,
} from "@/lib/formatters";
import { cn } from "@/lib/utils";

/**
 * Deadhead gets its own card because it is the metric owner-operators most
 * often ignore and it moves profit per mile more than rate does.
 */
export function DeadheadCard({ analysis }: { analysis: DeadheadAnalysis }) {
  const loadedShare = 100 - analysis.deadheadPct;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Route className="size-3.5 text-muted-foreground" />
          <CardTitle>Deadhead Analytics</CardTitle>
        </div>
        <span
          className={cn(
            "tnum text-2xs font-medium",
            analysis.elevated ? "text-warn" : "text-pos",
          )}
        >
          {formatPercent(analysis.deadheadPct)}
        </span>
      </CardHeader>

      <CardContent className="space-y-3 p-4">
        <div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="bg-pos"
              style={{ width: `${Math.max(loadedShare, 0)}%` }}
              aria-hidden
            />
            <div
              className={analysis.elevated ? "bg-neg" : "bg-warn"}
              style={{ width: `${Math.max(analysis.deadheadPct, 0)}%` }}
              aria-hidden
            />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between text-2xs">
            <span className="text-pos tnum">
              {formatNumber(analysis.loadedMiles)} mi loaded
            </span>
            <span className={cn("tnum", analysis.elevated ? "text-neg" : "text-warn")}>
              {formatNumber(analysis.deadheadMiles)} mi empty
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Stat
            label="Deadhead cost"
            value={formatMoney(analysis.deadheadCost)}
            sub="variable spend running empty"
          />
          <Stat
            label="Cost / total mile"
            value={formatRate(analysis.costPerTotalMile)}
            sub="drag on every mile driven"
            tone={analysis.elevated ? "warn" : undefined}
          />
          <Stat
            label="Rate dilution"
            value={formatRate(analysis.revenueDilutionPerMile)}
            sub="loaded rate minus all-miles rate"
          />
          <Stat
            label="Unearned revenue"
            value={formatMoney(analysis.opportunityRevenue)}
            sub="if those miles had been loaded"
          />
        </div>

        <div
          className={cn(
            "flex items-start gap-2 rounded-md border p-2.5 text-2xs leading-relaxed",
            analysis.elevated
              ? "border-warn/30 bg-warn-soft text-warn"
              : "border-border bg-surface-sunken text-muted-foreground",
          )}
        >
          {analysis.elevated ? <TriangleAlert className="mt-px size-3.5 shrink-0" /> : null}
          <span>
            {analysis.elevated ? (
              <>
                Deadhead is {formatPercent(analysis.deadheadPct)}, above your{" "}
                {formatPercent(analysis.warnPct, 0)} threshold. It is costing approximately{" "}
                <span className="font-semibold">{formatRate(analysis.costPerTotalMile)}</span> per
                total mile this period.
              </>
            ) : (
              <>
                Deadhead is {formatPercent(analysis.deadheadPct)} of total miles, within your{" "}
                {formatPercent(analysis.warnPct, 0)} threshold, and costs approximately{" "}
                <span className="font-medium text-foreground">
                  {formatRate(analysis.costPerTotalMile)}
                </span>{" "}
                per total mile.
              </>
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "warn";
}) {
  return (
    <div>
      <p className="label-xs">{label}</p>
      <p
        className={cn(
          "mt-0.5 tnum text-lg font-semibold tracking-tight",
          tone === "warn" ? "text-warn" : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-2xs text-muted-foreground">{sub}</p>
    </div>
  );
}
