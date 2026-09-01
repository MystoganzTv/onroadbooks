import { Info, Wallet } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney, formatPercent } from "@/lib/formatters";
import type { MoneyBreakdown } from "@/lib/types";
import { cn } from "@/lib/utils";

interface MoneyBreakdownCardProps {
  breakdown: MoneyBreakdown;
  periodLabel: string;
}

function Row({
  label,
  value,
  negative,
  strong,
  muted,
}: {
  label: string;
  value: number;
  negative?: boolean;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span
        className={cn(
          "text-sm",
          strong ? "font-medium text-foreground" : muted ? "text-muted-foreground" : "text-foreground/90",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "tnum text-sm",
          strong && "font-semibold",
          negative ? "text-neg" : "text-foreground",
        )}
      >
        {negative && value !== 0 ? `-${formatMoney(value)}` : formatMoney(value)}
      </span>
    </div>
  );
}

/**
 * The "where did the money go" statement. Reads top to bottom exactly like
 * the owner would work it out on paper.
 */
export function MoneyBreakdownCard({ breakdown, periodLabel }: MoneyBreakdownCardProps) {
  const positive = breakdown.availableCash >= 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Wallet className="size-3.5 text-muted-foreground" />
          <CardTitle>Money Breakdown</CardTitle>
        </div>
        <span className="text-2xs text-muted-foreground">{periodLabel}</span>
      </CardHeader>

      <CardContent className="p-4 pt-3">
        <div className="divide-y divide-border/70">
          <div>
            <Row label="Booked Revenue" value={breakdown.grossRevenue} />
            <Row label="Operating Expenses" value={breakdown.operatingExpenses} negative />
          </div>

          <div>
            <Row label="Operating Profit" value={breakdown.operatingProfit} strong />
          </div>

          <div>
            <Row
              label={`Tax Reserve ${formatPercent(breakdown.taxReservePct, 0)}`}
              value={breakdown.taxReserve}
              negative
              muted
            />
            <Row
              label={`Maintenance Reserve ${formatPercent(breakdown.maintenanceReservePct, 0)}`}
              value={breakdown.maintenanceReserve}
              negative
              muted
            />
          </div>
        </div>

        <div
          className={cn(
            "mt-3 rounded-md border p-3",
            positive ? "border-pos/30 bg-pos-soft" : "border-neg/30 bg-neg-soft",
          )}
        >
          <p className={cn("label-xs", positive ? "text-pos/80" : "text-neg/80")}>
            After Reserves (legacy performance view)
          </p>
          <p
            className={cn(
              "mt-1.5 text-4xl font-semibold tnum tracking-tight",
              positive ? "text-pos" : "text-neg",
            )}
          >
            {formatMoney(breakdown.availableCash)}
          </p>
          <p className="mt-1.5 flex items-start gap-1.5 text-2xs text-muted-foreground">
            <Info className="mt-px size-3 shrink-0" />
            What is actually yours after expenses and both reserves. Reserve
            percentages are editable in Settings.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
