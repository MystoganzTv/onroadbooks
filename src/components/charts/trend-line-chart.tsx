"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartTooltip } from "./chart-tooltip";

export interface TrendSeries {
  dataKey: string;
  name: string;
  color: string;
}

const axis = {
  stroke: "hsl(var(--muted-foreground))",
  fontSize: 10,
  tickLine: false,
  axisLine: false,
};

export function TrendLineChart({
  data,
  series,
  formatter = "money",
  height = 220,
  showLegend = true,
}: {
  data: object[];
  series: TrendSeries[];
  formatter?: "money" | "rate" | "number";
  height?: number;
  showLegend?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="hsl(var(--border))" />
        <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={12} />
        <YAxis
          {...axis}
          width={52}
          tickFormatter={(value: number) =>
            formatter === "rate"
              ? `$${value.toFixed(2)}`
              : value >= 1000
                ? `$${(value / 1000).toFixed(1)}k`
                : `$${Math.round(value)}`
          }
        />
        <Tooltip
          cursor={{ stroke: "hsl(var(--border))" }}
          content={<ChartTooltip valueFormat={formatter} />}
        />
        {showLegend ? (
          <Legend
            verticalAlign="top"
            align="right"
            height={22}
            iconType="plainline"
            iconSize={12}
            wrapperStyle={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}
          />
        ) : null}
        {series.map((s) => (
          <Line
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            name={s.name}
            stroke={s.color}
            strokeWidth={1.75}
            dot={{ r: 2, strokeWidth: 0, fill: s.color }}
            activeDot={{ r: 3.5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
