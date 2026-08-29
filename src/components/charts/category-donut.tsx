"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { formatMoney, formatPercent } from "@/lib/formatters";
import type { CategoryTotal } from "@/lib/types";
import { categoryColor } from "@/lib/categories";

function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: CategoryTotal }[];
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;

  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-2 shadow-lg">
      <p className="text-xs font-medium">{item.label}</p>
      <p className="mt-0.5 tnum text-xs text-muted-foreground">
        {formatMoney(item.amount)} - {formatPercent(item.share)}
      </p>
    </div>
  );
}

export function CategoryDonut({
  data,
  total,
  height = 200,
}: {
  data: CategoryTotal[];
  total: number;
  height?: number;
}) {
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="amount"
            nameKey="label"
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={0.6}
            stroke="hsl(var(--card))"
            strokeWidth={1}
          >
            {data.map((entry) => (
              <Cell key={entry.category} fill={categoryColor(entry.category)} />
            ))}
          </Pie>
          <Tooltip content={<DonutTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="label-xs">Total</span>
        <span className="tnum text-base font-semibold tracking-tight">{formatMoney(total)}</span>
      </div>
    </div>
  );
}
