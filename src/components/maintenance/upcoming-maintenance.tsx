"use client";

import { CalendarClock, CircleAlert, CircleCheck, Clock, Wrench } from "lucide-react";
import { useLanguage } from "@/components/shell/language-provider";
import { interpolate } from "@/lib/i18n/dictionaries";

import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/formatters";
import type { DueThresholds } from "@/lib/maintenance";
import type { DueStatus, MaintenanceDue } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Green = OK, amber = approaching, red = overdue. */
export const DUE_STYLE: Record<
  DueStatus,
  { chip: string; text: string; dot: string; icon: typeof CircleCheck; label: string }
> = {
  OK: {
    chip: "border-pos/30 bg-pos-soft text-pos",
    text: "text-pos",
    dot: "bg-pos",
    icon: CircleCheck,
    label: "OK",
  },
  DUE_SOON: {
    chip: "border-warn/30 bg-warn-soft text-warn",
    text: "text-warn",
    dot: "bg-warn",
    icon: Clock,
    label: "Approaching",
  },
  OVERDUE: {
    chip: "border-neg/30 bg-neg-soft text-neg",
    text: "text-neg",
    dot: "bg-neg",
    icon: CircleAlert,
    label: "Overdue",
  },
  UNSCHEDULED: {
    chip: "border-border bg-secondary text-muted-foreground",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground",
    icon: CalendarClock,
    label: "Unscheduled",
  },
};

export function UpcomingMaintenance({
  items,
  currentOdometer,
  thresholds,
}: {
  items: MaintenanceDue[];
  currentOdometer: number;
  thresholds: DueThresholds;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.maintenance;
  const overdue = items.filter((i) => i.status === "OVERDUE").length;
  const soon = items.filter((i) => i.status === "DUE_SOON").length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Wrench className="size-3.5 text-muted-foreground" />
          <CardTitle>{copy.upcoming}</CardTitle>
        </div>
        <span className="text-2xs text-muted-foreground tnum">
          {overdue > 0 ? (
            <span className="text-neg">{interpolate(copy.overdue, { count: overdue })}</span>
          ) : soon > 0 ? (
            <span className="text-warn">{interpolate(copy.approaching, { count: soon })}</span>
          ) : (
            <span className="text-pos">{copy.allClear}</span>
          )}
        </span>
      </CardHeader>

      <CardContent className="p-0">
        {items.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title={copy.nothingScheduled}
            description={copy.scheduleDescription}
            compact
          />
        ) : (
          <ul className="divide-y divide-border/70">
            {items.map((item) => {
              const style = DUE_STYLE[item.status];
              const Icon = style.icon;
              return (
                <li
                  key={item.record.id}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <Icon className={cn("size-4 shrink-0", style.text)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.label}</p>
                    <p className={cn("truncate text-2xs tnum", style.text)}>{item.summary}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded border px-1.5 py-0.5 text-2xs font-medium",
                      style.chip,
                    )}
                  >
                    {item.status === "OK" ? copy.ok : item.status === "DUE_SOON" ? copy.approaching.replace("{count} ", "") : item.status === "OVERDUE" ? copy.overdue.replace("{count} ", "") : copy.unscheduled}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <div className="border-t border-border px-4 py-2 text-2xs text-muted-foreground tnum">
        {interpolate(copy.approachingRule, { miles: formatNumber(thresholds.warnMiles), days: formatNumber(thresholds.warnDays), odometer: formatNumber(currentOdometer) })}
      </div>
    </Card>
  );
}
