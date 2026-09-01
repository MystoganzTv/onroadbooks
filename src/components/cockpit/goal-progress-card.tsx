import Link from "next/link";
import { Target, TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  formatRateValue,
} from "@/lib/formatters";
import type { GoalProgress, Projection } from "@/lib/finance/goals";
import { cn } from "@/lib/utils";

interface GoalProgressCardProps {
  goals: GoalProgress[];
  projection: Projection;
  periodLabel: string;
  className?: string;
}

function display(goal: GoalProgress, value: number): string {
  switch (goal.format) {
    case "money":
      return formatMoneyCompact(value);
    case "rate":
      return `${formatRateValue(value)}/mi`;
    case "percent":
      return formatPercent(value);
    case "count":
    default:
      return formatNumber(value);
  }
}

/**
 * GOALS AND PACE.
 *
 * Monthly targets, pro-rated by working days for shorter windows and labelled
 * as such. The projection is a straight-line extension of the pace so far and
 * says so on the card -- it is never presented as money the owner has.
 */
export function GoalProgressCard({
  goals,
  projection,
  periodLabel,
  className,
}: GoalProgressCardProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Target className="size-3.5 text-muted-foreground" />
          <CardTitle>On Track?</CardTitle>
        </div>
        <span className="text-2xs text-muted-foreground">{periodLabel}</span>
      </CardHeader>

      <CardContent className="space-y-3.5 p-4">
        {goals.length === 0 ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            No targets set yet.{" "}
            <Link href="/settings#goals" className="text-primary underline-offset-2 hover:underline">
              Set a monthly revenue and profit target
            </Link>{" "}
            and this becomes a pace tracker.
          </p>
        ) : (
          <ul className="space-y-3">
            {goals.map((goal) => {
              const pct = Math.max(0, Math.min(150, goal.pct));
              const good = goal.onTrack;
              return (
                <li key={goal.key}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium text-foreground">{goal.label}</span>
                    <span className="tnum text-xs text-muted-foreground">
                      <span className={cn("font-semibold", good ? "text-pos" : "text-foreground")}>
                        {display(goal, goal.current)}
                      </span>
                      {" / "}
                      {display(goal, goal.target)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width]",
                        good ? "bg-pos" : goal.lowerIsBetter ? "bg-warn" : "bg-info",
                      )}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-2xs text-muted-foreground">{goal.note}</span>
                    <span
                      className={cn(
                        "tnum text-2xs font-medium",
                        good ? "text-pos" : "text-muted-foreground",
                      )}
                    >
                      {goal.lowerIsBetter
                        ? good
                          ? "Under ceiling"
                          : "Over ceiling"
                        : `${Math.round(goal.pct)}%`}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {projection.applicable ? (
          <div className="rounded-md border border-dashed border-border bg-surface-sunken/50 p-3">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="size-3 text-muted-foreground" />
              <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                Projection
              </span>
            </div>
            <p className="mt-1.5 tnum text-xl font-semibold tracking-tight text-foreground">
              {formatMoneyCompact(projection.projectedRevenue)}
            </p>
            <p className="mt-1 text-2xs leading-relaxed text-muted-foreground tnum">
              {projection.workingDaysRemaining} working{" "}
              {projection.workingDaysRemaining === 1 ? "day" : "days"} left at{" "}
              {formatMoney(projection.revenuePerWorkingDay)} a day. Straight-line projection from
              the pace so far, not money already earned.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
