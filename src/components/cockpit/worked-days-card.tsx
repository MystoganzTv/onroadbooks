"use client";

import { CalendarDays } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MiniStat } from "@/components/dashboard/mini-stat";
import { useLanguage } from "@/components/shell/language-provider";
import { formatMoney } from "@/lib/formatters";
import { interpolate } from "@/lib/i18n/dictionaries";
import { localeTag } from "@/lib/i18n-format";
import { cn } from "@/lib/utils";
import type { WorkDay, WorkDayState, WorkedDaysReport } from "@/lib/worked-days";

/** Longer than this, a day grid stops being readable and months take over. */
const CALENDAR_MAX_DAYS = 62;

const CELL: Record<WorkDayState, string> = {
  worked: "bg-pos text-background font-semibold",
  off: "bg-neg-soft text-neg",
  booked: "bg-pos/30 text-foreground",
  upcoming: "border border-dashed border-border text-muted-foreground/60",
  before: "text-muted-foreground/30",
};

const BAR: Record<WorkDayState, string> = {
  worked: "bg-pos",
  off: "bg-neg-soft",
  booked: "bg-pos/30",
  upcoming: "bg-muted",
  before: "",
};

interface WorkedDaysCardProps {
  report: WorkedDaysReport;
  /** Booked revenue in the period, so the card can show what a working day earned. */
  revenue: number;
  className?: string;
}

/**
 * DAYS WORKED.
 *
 * A day counts as worked when any load was on the truck -- pickup through
 * delivery. Days that are over with nothing on them are the days off; today
 * and later are never called off, because they are not over.
 */
export function WorkedDaysCard({ report, revenue, className }: WorkedDaysCardProps) {
  const { dictionary, locale } = useLanguage();
  const copy = dictionary.dashboard;
  const tag = localeTag(locale);
  const earningDays = report.worked + report.booked;
  const dayUnit = (n: number) => (n === 1 ? copy.dayUnit : copy.daysUnit);
  const stateLabel: Record<WorkDayState, string> = {
    worked: copy.dayWorked,
    off: copy.dayOff,
    booked: copy.dayBooked,
    upcoming: copy.dayUpcoming,
    before: copy.dayBefore,
  };
  const legend = (["worked", "off", "booked", "upcoming"] as const).filter(
    (state) => state === "worked" || state === "off" || report[state] > 0,
  );

  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarDays className="size-3.5 text-muted-foreground" />
          <CardTitle>{copy.daysWorkedTitle}</CardTitle>
        </div>
        <span className="text-2xs text-muted-foreground">{copy.daysWorkedRule}</span>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,28rem)_1fr] lg:items-start">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:order-2 lg:grid-cols-2">
          <MiniStat
            label={copy.daysWorked}
            value={String(report.worked)}
            sub={report.booked > 0 ? interpolate(copy.plusBooked, { count: report.booked }) : dayUnit(report.worked)}
            tone="positive"
          />
          <MiniStat label={copy.daysOff} value={String(report.off)} sub={dayUnit(report.off)} tone={report.off > 0 ? "negative" : "neutral"} />
          <MiniStat
            label={copy.workedShare}
            value={report.workedShare === null ? "—" : `${Math.round(report.workedShare * 100)}%`}
            sub={report.longestOffStreak > 1 ? interpolate(copy.longestOffStreak, { count: report.longestOffStreak }) : copy.ofElapsedDays}
          />
          <MiniStat
            label={copy.earnedPerWorkedDay}
            value={earningDays > 0 ? formatMoney(revenue / earningDays) : "—"}
            sub={copy.grossRevenue}
            tone="info"
          />
        </div>

        <div className="lg:order-1">
          {report.days.length <= CALENDAR_MAX_DAYS ? (
            <DayGrid days={report.days} tag={tag} stateLabel={stateLabel} loadsLabel={copy.loadsOnDay} />
          ) : (
            <MonthBars report={report} tag={tag} stateLabel={stateLabel} />
          )}
        </div>
        </div>

        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted-foreground" aria-hidden>
          {legend.map((state) => (
            <li key={state} className="flex items-center gap-1.5">
              <span className={cn("inline-block size-2.5 rounded-sm", state === "upcoming" ? CELL.upcoming : BAR[state])} />
              {stateLabel[state]}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function DayGrid({
  days,
  tag,
  stateLabel,
  loadsLabel,
}: {
  days: WorkDay[];
  tag: string;
  stateLabel: Record<WorkDayState, string>;
  loadsLabel: string;
}) {
  // Weeks start on Sunday, as on a US wall calendar. Leading blanks align the
  // first day under its weekday.
  const lead = new Date(`${days[0].date}T12:00:00`).getDay();
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2026, 1, 1 + i).toLocaleDateString(tag, { weekday: "narrow" }),
  );
  const multiMonth = days[0].date.slice(0, 7) !== days[days.length - 1].date.slice(0, 7);

  return (
    <div className="max-w-md">
      <div className="grid grid-cols-7 gap-1 pb-1 text-center text-2xs text-muted-foreground" aria-hidden>
        {weekdays.map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <ol className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, i) => <li key={`lead-${i}`} aria-hidden />)}
        {days.map((day) => {
          const date = new Date(`${day.date}T12:00:00`);
          const full = date.toLocaleDateString(tag, { weekday: "long", month: "long", day: "numeric" });
          const detail = day.loadCount > 0 ? ` · ${interpolate(loadsLabel, { count: day.loadCount })}` : "";
          const label = `${full}: ${stateLabel[day.state]}${detail}`;
          const dayNumber = date.getDate();
          return (
            <li
              key={day.date}
              title={label}
              aria-label={label}
              className={cn(
                "flex aspect-square items-center justify-center rounded text-2xs tabular-nums",
                CELL[day.state],
              )}
            >
              {multiMonth && dayNumber === 1
                ? date.toLocaleDateString(tag, { month: "short" })
                : dayNumber}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function MonthBars({
  report,
  tag,
  stateLabel,
}: {
  report: WorkedDaysReport;
  tag: string;
  stateLabel: Record<WorkDayState, string>;
}) {
  const order = ["worked", "booked", "off", "upcoming"] as const;
  return (
    <ol className="space-y-2">
      {report.months.map((month) => {
        const total = month.worked + month.off + month.booked + month.upcoming;
        const name = new Date(`${month.month}-15T12:00:00`).toLocaleDateString(tag, { month: "short", year: "2-digit" });
        const label = order
          .filter((state) => month[state] > 0)
          .map((state) => `${stateLabel[state]}: ${month[state]}`)
          .join(" · ");
        return (
          <li key={month.month} className="grid grid-cols-[3.5rem_1fr_4.5rem] items-center gap-2 text-2xs">
            <span className="text-muted-foreground">{name}</span>
            <div className="flex h-3 overflow-hidden rounded-sm" role="img" aria-label={`${name}: ${label}`} title={label}>
              {order.map((state) =>
                month[state] > 0 ? (
                  <span key={state} className={BAR[state]} style={{ width: `${(month[state] / total) * 100}%` }} />
                ) : null,
              )}
            </div>
            <span className="text-right tabular-nums text-muted-foreground">
              <span className="font-semibold text-pos">{month.worked}</span> / {month.worked + month.off}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
