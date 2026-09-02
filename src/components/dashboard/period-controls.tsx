"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  monthOptions,
  PERIOD_OPTIONS,
  shiftMonth,
  todayISO,
  weekRange,
  type Period,
  type PeriodKey,
} from "@/lib/periods";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/shell/language-provider";

interface PeriodControlsProps {
  period: Period;
  className?: string;
}

/**
 * The single period control, used on every screen.
 *
 * State lives in the URL, so switching from 1-15 to Quarter recomputes every
 * server component on the page from the same range -- and the same query
 * string drives the CSV exports.
 */
export function PeriodControls({ period, className }: PeriodControlsProps) {
  const router = useRouter();
  const { locale, dictionary } = useLanguage();
  const copy = dictionary.dashboard;
  const shortLabels: Record<PeriodKey, string> = { today: copy.periodToday, week: copy.periodWeek, first: copy.periodFirst, second: copy.periodSecond, full: copy.periodMonth, quarter: copy.periodQuarter, ytd: copy.periodYtd, custom: copy.periodCustom };
  const fullLabels: Record<PeriodKey, string> = { today: copy.periodTodayTitle, week: copy.periodWeekTitle, first: copy.periodFirstTitle, second: copy.periodSecondTitle, full: copy.periodMonthTitle, quarter: copy.periodQuarterTitle, ytd: copy.periodYtdTitle, custom: copy.periodCustomTitle };
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [customOpen, setCustomOpen] = useState(false);
  const [from, setFrom] = useState(period.start);
  const [to, setTo] = useState(period.end);

  // The component survives searchParam navigations, so without this the
  // popover would keep showing the range from whenever the page first
  // rendered and "Apply" would silently reinstate it.
  useEffect(() => {
    setFrom(period.start);
    setTo(period.end);
  }, [period.start, period.end]);

  const push = useCallback(
    (next: { month?: string; period?: PeriodKey; from?: string; to?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.month) params.set("month", next.month);
      if (next.period) params.set("period", next.period);
      if (next.period && next.period !== "custom") {
        params.delete("from");
        params.delete("to");
      }

      // "Today" and "This week" are resolved from the browser's calendar and
      // sent along explicitly. Otherwise the server would use its own
      // timezone, which can be a day out from the person entering the loads.
      if (next.period === "today") {
        const today = todayISO();
        params.set("from", today);
        params.set("to", today);
        params.set("month", today.slice(0, 7));
      } else if (next.period === "week") {
        const week = weekRange(todayISO());
        params.set("from", week.start);
        params.set("to", week.end);
        params.set("month", week.start.slice(0, 7));
      }

      if (next.from) params.set("from", next.from);
      if (next.to) params.set("to", next.to);
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  return (
    <div
      className={cn(
        "flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1 print:hidden",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        // Dimmed while navigating, but NOT pointer-events-none.
        //
        // Next aborts a router push that lands while it is still prefetching
        // the sidebar routes -- a real possibility on the first click after a
        // page load. The transition then never resolves, `pending` stays true,
        // and blocking pointer events left the whole period bar dead until a
        // full reload. Staying clickable means a second click just works, which
        // is what a person does anyway.
        pending && "opacity-70",
        className,
      )}
    >
      <div className="flex shrink-0 items-center rounded-md bg-surface-sunken/70">
        <Button
          variant="ghost"
          size="icon-sm"
          className="h-9 w-9 rounded-r-none"
          onClick={() => push({ month: shiftMonth(period.month, -1), period: "full" })}
          aria-label={copy.previousMonth}
          title={copy.previousMonth}
        >
          <ChevronLeft />
        </Button>
        <Select
          value={period.month}
          onValueChange={(value) => push({ month: value, period: "full" })}
        >
          <SelectTrigger
            className="h-9 w-[8.75rem] rounded-none border-x border-y-0 border-border/70 bg-transparent text-xs shadow-none focus:ring-0 focus:ring-offset-0"
            aria-label={copy.selectMonth}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions(period.month).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {locale === "es" ? localizedMonth(option.value) : option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon-sm"
          className="h-9 w-9 rounded-l-none"
          onClick={() => push({ month: shiftMonth(period.month, 1), period: "full" })}
          aria-label={copy.nextMonth}
          title={copy.nextMonth}
        >
          <ChevronRight />
        </Button>
      </div>

      <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />

      <div className="inline-flex shrink-0 items-center gap-0.5" role="group" aria-label={copy.period}>
        {PERIOD_OPTIONS.filter((o) => o.key !== "custom").map((option, index, all) => (
          <span key={option.key} className="flex items-center">
            {index > 0 && all[index - 1].group !== option.group ? (
              <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            ) : null}
            <button
              type="button"
              onClick={() => push({ period: option.key })}
              aria-pressed={period.key === option.key}
              title={fullLabels[option.key]}
              className={cn(
                "h-9 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                period.key === option.key
                  ? "bg-accent text-accent-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {shortLabels[option.key]}
            </button>
          </span>
        ))}
      </div>

      <Popover open={customOpen} onOpenChange={setCustomOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-9 shrink-0 px-2.5",
              period.key === "custom" && "bg-accent text-accent-foreground shadow-sm",
            )}
            aria-pressed={period.key === "custom"}
          >
            <CalendarRange />
            {period.key === "custom" ? period.shortLabel : copy.custom}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[17.25rem]" align="end">
          <p className="label-xs">{copy.customRange}</p>
          <div className="mt-2 space-y-2">
            <label className="block">
              <span className="mb-1 block text-2xs text-muted-foreground">{copy.from}</span>
              <Input
                type="date"
                value={from}
                max={to || todayISO()}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-2xs text-muted-foreground">{copy.to}</span>
              <Input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <Button
              size="sm"
              className="w-full"
              disabled={!from || !to}
              onClick={() => {
                setCustomOpen(false);
                push({ period: "custom", from, to });
              }}
            >
              {copy.applyRange}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function localizedMonth(value: string): string {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat("es-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)))
    .replace(/^./, (character) => character.toUpperCase());
}
