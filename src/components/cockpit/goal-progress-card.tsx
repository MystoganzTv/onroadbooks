"use client";

import Link from "next/link";
import { Target, TrendingUp } from "lucide-react";

import { useLanguage } from "@/components/shell/language-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  formatRateValue,
} from "@/lib/formatters";
import type { GoalProgress, Projection } from "@/lib/finance/goals";
import { interpolate } from "@/lib/i18n/dictionaries";
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
  const { dictionary } = useLanguage();
  const copy = dictionary.dashboard;
  const goalLabel = (goal: GoalProgress) => {
    if (goal.key === "revenue") return copy.youEarned;
    if (goal.key === "profit") return copy.businessMade;
    if (goal.key === "profitPerMile") return copy.profitPerMile;
    if (goal.key === "deadhead") return copy.deadhead;
    return copy.loads;
  };
  const goalNote = (goal: GoalProgress) => {
    if (goal.prorated) {
      const percent = goal.note.match(/\d+/)?.[0] ?? "0";
      return interpolate(copy.monthlyTargetShare, { percent });
    }
    if (goal.key === "profitPerMile") return copy.targetRateAnyPeriod;
    if (goal.key === "deadhead") return copy.ceilingAnyPeriod;
    return copy.monthlyTarget;
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Target className="size-3.5 text-muted-foreground" />
          <CardTitle>{copy.onTrack}</CardTitle>
        </div>
        <span className="text-2xs text-muted-foreground">{periodLabel}</span>
      </CardHeader>

      <CardContent className="space-y-3.5 p-4">
        {goals.length === 0 ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {copy.noTargets}{" "}
            <Link href="/settings?section=business#goals" className="text-primary underline-offset-2 hover:underline">
              {copy.setTargets}
            </Link>{" "}
            {copy.paceTracker}
          </p>
        ) : (
          <ul className="space-y-3">
            {goals.map((goal) => {
              const pct = Math.max(0, Math.min(150, goal.pct));
              const good = goal.onTrack;
              return (
                <li key={goal.key}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium text-foreground">{goalLabel(goal)}</span>
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
                    <span className="text-2xs text-muted-foreground">{goalNote(goal)}</span>
                    <span
                      className={cn(
                        "tnum text-2xs font-medium",
                        good ? "text-pos" : "text-muted-foreground",
                      )}
                    >
                      {goal.lowerIsBetter
                        ? good
                          ? copy.underCeiling
                          : copy.overCeiling
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
                {copy.projection}
              </span>
            </div>
            <p className="mt-1.5 tnum text-xl font-semibold tracking-tight text-foreground">
              {formatMoneyCompact(projection.projectedRevenue)}
            </p>
            <p className="mt-1 text-2xs leading-relaxed text-muted-foreground tnum">
              {interpolate(copy.projectionExplanation, {
                days: projection.workingDaysRemaining,
                unit: projection.workingDaysRemaining === 1 ? copy.day : copy.days,
                amount: formatMoney(projection.revenuePerWorkingDay),
              })}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
