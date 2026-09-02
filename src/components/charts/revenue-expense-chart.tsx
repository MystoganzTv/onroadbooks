"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartTooltip } from "./chart-tooltip";
import { useLanguage } from "@/components/shell/language-provider";

export interface RevenueExpensePoint {
  label: string;
  revenue: number;
  expenses: number;
}

const axis = {
  stroke: "hsl(var(--muted-foreground))",
  fontSize: 10,
  tickLine: false,
  axisLine: false,
};

export function RevenueExpenseChart({
  data,
  height = 240,
}: {
  data: RevenueExpensePoint[];
  height?: number;
}) {
  const { dictionary } = useLanguage();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barGap={2}>
        <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="hsl(var(--border))" />
        <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={12} />
        <YAxis
          {...axis}
          width={52}
          tickFormatter={(value: number) =>
            value >= 1000 ? `$${(value / 1000).toFixed(1)}k` : `$${Math.round(value)}`
          }
        />
        <Tooltip
          cursor={{ fill: "hsl(var(--accent))", opacity: 0.4 }}
          content={<ChartTooltip valueFormat="money" />}
        />
        <Legend
          verticalAlign="top"
          align="right"
          height={22}
          iconType="square"
          iconSize={8}
          wrapperStyle={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}
        />
        <Bar dataKey="revenue" name={dictionary.reports.earned} fill="hsl(var(--pos))" radius={[2, 2, 0, 0]} maxBarSize={26} />
        <Bar dataKey="expenses" name={dictionary.reports.businessExpenses} fill="hsl(var(--neg))" radius={[2, 2, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}
