import Link from "next/link";
import { Wrench } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney, formatMoneyCompact } from "@/lib/formatters";
import type { MaintenanceHealth } from "@/lib/finance/maintenance-health";
import type { DueStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS: Record<DueStatus, { dot: string; text: string }> = {
  OK: { dot: "bg-pos", text: "text-pos" },
  DUE_SOON: { dot: "bg-warn", text: "text-warn" },
  OVERDUE: { dot: "bg-neg", text: "text-neg" },
  UNSCHEDULED: { dot: "bg-muted-foreground", text: "text-muted-foreground" },
};

/**
 * TRUCK HEALTH.
 *
 * What is due, and whether the maintenance bucket can pay for it. The coverage
 * ratio is only shown when there is a priced service to cover -- a ratio with
 * nothing behind it would be a made-up number.
 */
export function TruckHealthPanel({
  health,
  limit = 5,
  className,
  showReserve = true,
}: {
  health: MaintenanceHealth;
  limit?: number;
  className?: string;
  showReserve?: boolean;
}) {
  const items = health.items.slice(0, limit);

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Wrench className="size-3.5 text-muted-foreground" />
          <CardTitle>Truck Health</CardTitle>
        </div>
        <Link
          href="/truck"
          className="text-2xs font-medium text-primary underline-offset-2 hover:underline focus-ring"
        >
          Service log
        </Link>
      </CardHeader>

      <CardContent className="p-0">
        {items.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">
            Nothing scheduled. Log a service on the Truck page to start tracking intervals.
          </p>
        ) : (
          <ul className="divide-y divide-border/70">
            {items.map((item) => {
              const status = STATUS[item.status];
              return (
                <li
                  key={item.record.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn("size-2 shrink-0 rounded-full", status.dot)} aria-hidden />
                    <span className="truncate text-xs text-foreground">{item.label}</span>
                  </span>
                  <span className={cn("shrink-0 tnum text-2xs font-medium", status.text)}>
                    {item.summary}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className={cn("grid gap-3 border-t border-border p-4", showReserve ? "grid-cols-3" : "grid-cols-1")}>
          <Figure
            label="Due soon"
            value={health.upcomingCost > 0 ? formatMoneyCompact(health.upcomingCost) : "—"}
            tone={health.upcomingCost > 0 ? "text-warn" : undefined}
          />
          {showReserve ? (
            <>
              <Figure label="Reserve" value={formatMoneyCompact(health.reserveBalance)} />
              <Figure
                label="Coverage"
                value={health.coverage !== null ? `${health.coverage.toFixed(2)}x` : "—"}
                tone={
                  health.coverage === null
                    ? undefined
                    : health.coverage >= 1
                      ? "text-pos"
                      : "text-neg"
                }
              />
            </>
          ) : null}
        </div>

        {health.unpricedCount > 0 ? (
          <p className="border-t border-border px-4 py-2 text-2xs text-muted-foreground">
            {health.unpricedCount} due {health.unpricedCount === 1 ? "item has" : "items have"} never
            been logged with a cost, so {health.unpricedCount === 1 ? "it is" : "they are"} not in
            the {formatMoney(health.upcomingCost)} estimate.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="label-xs truncate">{label}</p>
      <p className={cn("mt-0.5 tnum text-lg font-semibold tracking-tight", tone)}>{value}</p>
    </div>
  );
}
