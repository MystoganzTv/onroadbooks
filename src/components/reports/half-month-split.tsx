import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney, formatPercent, formatRate } from "@/lib/formatters";
import type { Period } from "@/lib/periods";
import type { PeriodSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

interface HalfMonthSplitProps {
  halves: { period: Period; summary: PeriodSummary }[];
  monthLabel: string;
}

/**
 * First half vs second half, computed from actual dated rows -- never by
 * halving a monthly total.
 */
export function HalfMonthSplit({ halves, monthLabel }: HalfMonthSplitProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Half-Month Split</CardTitle>
        <span className="text-2xs text-muted-foreground">{monthLabel}</span>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
        {halves.map(({ period, summary }) => {
          const positive = summary.netProfit >= 0;
          return (
            <div key={period.key} className="rounded-md border border-border bg-surface-sunken p-3">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium">
                  {period.key === "first" ? "Days 1 - 15" : `Days 16 - ${period.end.slice(-2)}`}
                </p>
                <span className="text-2xs text-muted-foreground tnum">
                  {summary.loadCount} loads
                </span>
              </div>
              <p
                className={cn(
                  "mt-2 text-2xl font-semibold tnum tracking-tight",
                  positive ? "text-pos" : "text-neg",
                )}
              >
                {formatMoney(summary.netProfit)}
              </p>
              <p className="text-2xs text-muted-foreground">net profit</p>

              <dl className="mt-3 space-y-1 text-xs">
                <Line label="Revenue" value={formatMoney(summary.grossRevenue)} />
                <Line
                  label="Expenses"
                  value={`-${formatMoney(summary.operatingExpenses)}`}
                  tone="neg"
                />
                <Line label="Margin" value={formatPercent(summary.netMargin)} />
                <Line label="Profit / mi" value={formatRate(summary.profitPerMile)} />
              </dl>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: "neg" }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tnum", tone === "neg" ? "text-neg" : "text-foreground")}>{value}</dd>
    </div>
  );
}
