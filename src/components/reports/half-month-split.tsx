"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/components/shell/language-provider";
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
  const { dictionary } = useLanguage();
  const copy = dictionary.reports;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.halfMonthSplit}</CardTitle>
        <span className="text-2xs text-muted-foreground">{monthLabel}</span>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
        {halves.map(({ period, summary }) => {
          const positive = summary.operatingProfit >= 0;
          return (
            <div key={period.key} className="rounded-md border border-border bg-surface-sunken p-3">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium">
                  {period.key === "first"
                    ? copy.daysFirst
                    : copy.daysSecond.replace("{day}", period.end.slice(-2).replace(/^0/, ""))}
                </p>
                <span className="text-2xs text-muted-foreground tnum">
                  {copy.loadCount.replace("{count}", String(summary.loadCount))}
                </span>
              </div>
              <p
                className={cn(
                  "mt-2 text-2xl font-semibold tnum tracking-tight",
                  positive ? "text-pos" : "text-neg",
                )}
              >
                {formatMoney(summary.operatingProfit)}
              </p>
              <p className="text-2xs text-muted-foreground">{copy.operatingProfit}</p>

              <dl className="mt-3 space-y-1 text-xs">
                <Line label={copy.bookedRevenue} value={formatMoney(summary.bookedRevenue)} />
                <Line label={copy.collectedRevenue} value={formatMoney(summary.collectedRevenue)} />
                <Line label={copy.accountsReceivable} value={formatMoney(summary.accountsReceivable)} />
                <Line
                  label={copy.businessExpenses}
                  value={`-${formatMoney(summary.operatingExpenses)}`}
                  tone="neg"
                />
                <Line label={copy.margin} value={formatPercent(summary.netMargin)} />
                <Line label={copy.profitPerMile} value={formatRate(summary.profitPerMile)} />
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
