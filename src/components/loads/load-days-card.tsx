"use client";

import { CalendarDays } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/components/shell/language-provider";
import { formatMoney } from "@/lib/formatters";
import type { LoadDayKind, LoadPerDay } from "@/lib/finance/load-days";
import { formatLocaleDate } from "@/lib/i18n-format";
import { interpolate } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

/** Past two weeks the strip stops being readable; the numbers still stand. */
const MAX_STRIP_DAYS = 14;

/** The per-day view of a load: how long it held the truck and what each day left. */
export function LoadDaysCard({ perDay }: { perDay: LoadPerDay }) {
  const { dictionary, locale } = useLanguage();
  const copy = dictionary.loads;
  const { days, fixed } = perDay;
  const plural = (n: number) => (n === 1 ? copy.dayWord : copy.daysWord);
  const kindLabel: Record<LoadDayKind, string> = {
    PICKUP: copy.dayPickup,
    DELIVERY: copy.dayDelivery,
    PICKUP_DELIVERY: copy.dayPickupDelivery,
    HANDOFF: copy.dayHandoff,
    IN_TRANSIT: "",
    IDLE: copy.dayIdle,
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CalendarDays className="size-3.5 text-muted-foreground" />
          <CardTitle>{copy.loadTime}</CardTitle>
        </div>
        <span className="text-2xs text-muted-foreground tnum">
          {days.start === days.end
            ? formatLocaleDate(days.start, locale, "short")
            : `${formatLocaleDate(days.start, locale, "short")} – ${formatLocaleDate(days.end, locale, "short")}`}
        </span>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {!days.complete ? (
          <p className="text-sm text-muted-foreground">{copy.needDelivery}</p>
        ) : (
          <>
            {days.busyDays <= MAX_STRIP_DAYS ? (
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${days.busyDays}, minmax(0, 1fr))` }}>
                {days.days.map((day) => (
                  <div
                    key={day.date}
                    className={cn(
                      "rounded-md px-1 py-2 text-center text-xs",
                      day.kind === "IDLE" ? "bg-warn-soft text-warn" : "bg-info-soft text-info",
                    )}
                  >
                    <span className="block font-medium" title={day.kind === "IN_TRANSIT" ? undefined : kindLabel[day.kind]}>{formatLocaleDate(day.date, locale, { weekday: "short", day: "numeric" })}</span>
                    <span className="hidden truncate text-2xs sm:block">
                      {day.kind === "IN_TRANSIT" ? interpolate(copy.legTitle, { n: day.leg ?? 1 }) : kindLabel[day.kind]}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground tnum">
              {[
                `${days.busyDays} ${plural(days.busyDays)} ${copy.busy}`,
                `${days.loadedDays} ${copy.withLoad}`,
                days.idleDays ? `${days.idleDays} ${copy.idle}` : null,
              ].filter(Boolean).join(" · ")}
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <PerDay
                label={copy.profitPerDay}
                value={formatMoney(perDay.profitPerDay)}
                sub={`${formatMoney(perDay.profit)} ÷ ${days.busyDays} ${plural(days.busyDays)}`}
              />
              <PerDay
                label={copy.fixedPerDay}
                value={fixed.monthly > 0 ? formatMoney(fixed.perDay) : "—"}
                sub={fixed.monthly > 0 ? fixed.bills.slice(0, 3).join(", ") : copy.noFixedCosts}
              />
              <PerDay
                label={copy.leftPerDay}
                value={fixed.monthly > 0 ? formatMoney(perDay.leftPerDay) : "—"}
                sub={fixed.monthly > 0 ? `${formatMoney(perDay.profitPerDay)} − ${formatMoney(fixed.perDay)}` : undefined}
                tone={fixed.monthly > 0 ? (perDay.leftPerDay >= 0 ? "pos" : "neg") : undefined}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PerDay({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "pos" | "neg" }) {
  return (
    <div className="min-w-0 rounded-md bg-surface-sunken px-3 py-2.5">
      <p className="label-xs">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold tnum tracking-tight", tone === "pos" && "text-pos", tone === "neg" && "text-neg")}>{value}</p>
      {sub ? <p className="mt-0.5 truncate text-2xs text-muted-foreground" title={sub}>{sub}</p> : null}
    </div>
  );
}
