"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeltaBadge } from "@/components/shared/delta-badge";
import { useLanguage } from "@/components/shell/language-provider";
import { pctChange } from "@/lib/calculations";
import {
  formatMoney,
  formatNumber,
  formatPercent,
  formatRate,
} from "@/lib/formatters";
import type { PeriodSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Row {
  label: string;
  current: string;
  previous: string;
  delta?: number;
  higherIsBetter?: boolean;
  emphasis?: boolean;
  tone?: "pos" | "neg";
}

interface ReportSummaryProps {
  current: PeriodSummary;
  previous: PeriodSummary;
  currentLabel: string;
  previousLabel: string;
}

/** Side-by-side statement: this period vs the one before it. */
export function ReportSummary({
  current,
  previous,
  currentLabel,
  previousLabel,
}: ReportSummaryProps) {
  const { dictionary } = useLanguage();
  const copy = dictionary.reports;
  const rows: Row[] = [
    {
      label: copy.bookedRevenue,
      current: formatMoney(current.bookedRevenue),
      previous: formatMoney(previous.bookedRevenue),
      delta: pctChange(current.bookedRevenue, previous.bookedRevenue),
      emphasis: true,
    },
    {
      label: copy.collectedRevenue,
      current: formatMoney(current.collectedRevenue),
      previous: formatMoney(previous.collectedRevenue),
      delta: pctChange(current.collectedRevenue, previous.collectedRevenue),
      emphasis: true,
    },
    {
      label: copy.accountsReceivable,
      current: formatMoney(current.accountsReceivable),
      previous: formatMoney(previous.accountsReceivable),
      delta: pctChange(current.accountsReceivable, previous.accountsReceivable),
      higherIsBetter: false,
    },
    {
      label: copy.businessExpenses,
      current: formatMoney(current.operatingExpenses),
      previous: formatMoney(previous.operatingExpenses),
      delta: pctChange(current.operatingExpenses, previous.operatingExpenses),
      higherIsBetter: false,
      tone: "neg",
    },
    {
      label: copy.operatingProfit,
      current: formatMoney(current.operatingProfit),
      previous: formatMoney(previous.operatingProfit),
      delta: pctChange(current.operatingProfit, previous.operatingProfit),
      emphasis: true,
      tone: current.operatingProfit >= 0 ? "pos" : "neg",
    },
    {
      label: copy.debtFinancing,
      current: formatMoney(current.debtService),
      previous: formatMoney(previous.debtService),
      delta: pctChange(current.debtService, previous.debtService),
      higherIsBetter: false,
      tone: "neg",
    },
    {
      label: copy.cashAfterDebt,
      current: formatMoney(current.cashAfterDebtService),
      previous: formatMoney(previous.cashAfterDebtService),
      delta: pctChange(current.cashAfterDebtService, previous.cashAfterDebtService),
      emphasis: true,
      tone: current.cashAfterDebtService >= 0 ? "pos" : "neg",
    },
    {
      label: copy.operatingMargin,
      current: formatPercent(current.netMargin),
      previous: formatPercent(previous.netMargin),
      delta: current.netMargin - previous.netMargin,
    },
    {
      label: copy.totalMiles,
      current: formatNumber(current.totalMiles),
      previous: formatNumber(previous.totalMiles),
      delta: pctChange(current.totalMiles, previous.totalMiles),
    },
    {
      label: copy.revenuePerMile,
      current: formatRate(current.revenuePerMile),
      previous: formatRate(previous.revenuePerMile),
      delta: pctChange(current.revenuePerMile, previous.revenuePerMile),
    },
    {
      label: copy.actualCostPerMile,
      current: formatRate(current.costPerMile),
      previous: formatRate(previous.costPerMile),
      delta: pctChange(current.costPerMile, previous.costPerMile),
      higherIsBetter: false,
    },
    {
      label: copy.profitPerMile,
      current: formatRate(current.profitPerMile),
      previous: formatRate(previous.profitPerMile),
      delta: pctChange(current.profitPerMile, previous.profitPerMile),
      emphasis: true,
      tone: current.profitPerMile >= 0 ? "pos" : "neg",
    },
    {
      label: copy.fuelExpense,
      current: formatMoney(current.fuelExpense),
      previous: formatMoney(previous.fuelExpense),
      delta: pctChange(current.fuelExpense, previous.fuelExpense),
      higherIsBetter: false,
    },
    {
      label: copy.maintenanceRepairs,
      current: formatMoney(current.maintenanceExpense),
      previous: formatMoney(previous.maintenanceExpense),
      delta: pctChange(current.maintenanceExpense, previous.maintenanceExpense),
      higherIsBetter: false,
    },
    {
      label: copy.fixedExpenses,
      current: formatMoney(current.fixedExpenses),
      previous: formatMoney(previous.fixedExpenses),
      delta: pctChange(current.fixedExpenses, previous.fixedExpenses),
      higherIsBetter: false,
    },
    {
      label: copy.variableExpenses,
      current: formatMoney(current.variableExpenses),
      previous: formatMoney(previous.variableExpenses),
      delta: pctChange(current.variableExpenses, previous.variableExpenses),
      higherIsBetter: false,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.periodReport}</CardTitle>
        <span className="text-2xs text-muted-foreground">
          {copy.versus.replace("{period}", previousLabel)}
        </span>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 border-b border-border px-4 py-2 text-2xs uppercase tracking-wider text-muted-foreground">
          <span>{copy.metric}</span>
          <span className="text-right">{currentLabel}</span>
          <span className="hidden text-right sm:block">{previousLabel}</span>
          <span className="text-right">{copy.change}</span>
        </div>
        <ul className="divide-y divide-border/70">
          {rows.map((row) => (
            <li
              key={row.label}
              className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 px-4 py-1.5"
            >
              <span
                className={cn(
                  "truncate text-sm",
                  row.emphasis ? "font-medium text-foreground" : "text-foreground/85",
                )}
              >
                {row.label}
              </span>
              <span
                className={cn(
                  "w-[5.75rem] text-right tnum text-sm",
                  row.emphasis && "font-semibold",
                  row.tone === "pos" && "text-pos",
                  row.tone === "neg" && "text-neg",
                )}
              >
                {row.current}
              </span>
              <span className="hidden w-[5.75rem] text-right tnum text-sm text-muted-foreground sm:block">
                {row.previous}
              </span>
              <span className="w-[3.875rem] text-right">
                {row.delta !== undefined ? (
                  <DeltaBadge value={row.delta} higherIsBetter={row.higherIsBetter} />
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
