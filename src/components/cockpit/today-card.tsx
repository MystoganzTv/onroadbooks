"use client";

import { CalendarCheck } from "lucide-react";

import { useLanguage } from "@/components/shell/language-provider";
import { formatMiles, formatMoney, formatMoneyCompact, formatRateValue } from "@/lib/formatters";
import type { DaySnapshot } from "@/lib/finance/goals";
import { interpolate } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

const VERDICT: Record<DaySnapshot["verdict"], { chip: string }> = {
  GOOD: { chip: "border-pos/40 bg-pos-soft text-pos" },
  ON_TRACK: { chip: "border-info/40 bg-info-soft text-info" },
  BEHIND: { chip: "border-warn/40 bg-warn-soft text-warn" },
  NO_DATA: { chip: "border-border bg-surface-sunken text-muted-foreground" },
};

/**
 * TODAY.
 *
 * One deterministic verdict against the daily profit target, which is the
 * monthly profit goal spread over working days. No model, no adjectives that
 * the arithmetic does not support.
 */
export function TodayCard({ day, className }: { day: DaySnapshot; className?: string }) {
  const { dictionary } = useLanguage();
  const copy = dictionary.dashboard;
  const verdict = VERDICT[day.verdict];
  const verdictLabel = day.verdict === "GOOD"
    ? copy.goodDay
    : day.verdict === "ON_TRACK"
      ? copy.onTrack
      : day.verdict === "BEHIND"
        ? copy.behindPace
        : copy.nothingYet;
  const statement = day.verdict === "NO_DATA"
    ? copy.todayNothingRecorded
    : day.target <= 0
      ? interpolate(copy.todayProfitNoTarget, {
          amount: formatMoney(Math.abs(day.profit)),
          count: day.loadCount,
          unit: day.loadCount === 1 ? copy.load : copy.loads,
        })
      : day.delta >= 0
        ? interpolate(copy.aboveDailyTarget, {
            amount: formatMoney(Math.abs(day.delta)),
            target: formatMoney(Math.abs(day.target)),
          })
        : interpolate(copy.belowDailyTarget, {
            amount: formatMoney(Math.abs(day.delta)),
            target: formatMoney(Math.abs(day.target)),
          });

  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}>
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <span className="flex items-center gap-2">
          <CalendarCheck className="size-3.5 text-muted-foreground" />
          <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {copy.todayOperations}
          </span>
        </span>
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide",
            verdict.chip,
          )}
        >
          {verdictLabel}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-x-2 gap-y-3 p-4 sm:grid-cols-5">
        <Cell label={copy.youEarned} value={formatMoneyCompact(day.revenue)} />
        <Cell label={copy.businessExpenses} value={formatMoneyCompact(day.expenses)} tone="text-neg" />
        <Cell
          label={copy.businessMade}
          value={formatMoneyCompact(day.profit)}
          tone={day.profit >= 0 ? "text-pos" : "text-neg"}
        />
        <Cell label={copy.miles} value={formatMiles(day.miles)} />
        <Cell label={copy.profitPerMile} value={`${formatRateValue(day.profitPerMile)}`} />
      </div>

      <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        {statement}
      </p>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 text-center">
      <p className="label-xs flex min-h-8 items-end justify-center text-center leading-4">
        <span className="line-clamp-2">{label}</span>
      </p>
      <p
        data-slot="today-metric-value"
        className={cn("mt-1 whitespace-nowrap tnum text-lg font-semibold tracking-tight", tone)}
      >
        {value}
      </p>
    </div>
  );
}
