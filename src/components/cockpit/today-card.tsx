import { CalendarCheck } from "lucide-react";

import { formatMiles, formatMoneyCompact, formatRateValue } from "@/lib/formatters";
import type { DaySnapshot } from "@/lib/finance/goals";
import { cn } from "@/lib/utils";

const VERDICT: Record<DaySnapshot["verdict"], { label: string; chip: string }> = {
  GOOD: { label: "Good day", chip: "border-pos/40 bg-pos-soft text-pos" },
  ON_TRACK: { label: "On track", chip: "border-info/40 bg-info-soft text-info" },
  BEHIND: { label: "Behind pace", chip: "border-warn/40 bg-warn-soft text-warn" },
  NO_DATA: { label: "Nothing yet", chip: "border-border bg-surface-sunken text-muted-foreground" },
};

/**
 * TODAY.
 *
 * One deterministic verdict against the daily profit target, which is the
 * monthly profit goal spread over working days. No model, no adjectives that
 * the arithmetic does not support.
 */
export function TodayCard({ day, className }: { day: DaySnapshot; className?: string }) {
  const verdict = VERDICT[day.verdict];

  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <span className="flex items-center gap-2">
          <CalendarCheck className="size-3.5 text-muted-foreground" />
          <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Today
          </span>
        </span>
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide",
            verdict.chip,
          )}
        >
          {verdict.label}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 p-4 sm:grid-cols-5">
        <Cell label="Booked Revenue" value={formatMoneyCompact(day.revenue)} />
        <Cell label="Operating Expenses" value={formatMoneyCompact(day.expenses)} tone="text-neg" />
        <Cell
          label="Operating Profit"
          value={formatMoneyCompact(day.profit)}
          tone={day.profit >= 0 ? "text-pos" : "text-neg"}
        />
        <Cell label="Miles" value={formatMiles(day.miles)} />
        <Cell label="Operating Profit / mi" value={`${formatRateValue(day.profitPerMile)}`} />
      </div>

      <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        {day.statement}
      </p>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="label-xs truncate">{label}</p>
      <p className={cn("mt-0.5 tnum text-lg font-semibold tracking-tight", tone)}>{value}</p>
    </div>
  );
}
