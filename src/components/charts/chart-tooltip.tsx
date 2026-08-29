"use client";

import type { TooltipProps } from "recharts";

import { formatMoney, formatRateValue } from "@/lib/formatters";

type Formatter = "money" | "rate" | "number";

interface ChartTooltipProps extends Omit<TooltipProps<number, string>, "formatter"> {
  /** Renamed from Recharts' own `formatter` prop: this picks a display style. */
  valueFormat?: Formatter;
}

function render(value: number, formatter: Formatter): string {
  if (formatter === "money") return formatMoney(value);
  if (formatter === "rate") return `${formatRateValue(value)}/mi`;
  return new Intl.NumberFormat("en-US").format(value);
}

/** Shared tooltip so every chart in the app reads the same way. */
export function ChartTooltip({
  active,
  payload,
  label,
  valueFormat = "money",
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-2 shadow-lg">
      <p className="mb-1 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <ul className="space-y-0.5">
        {payload.map((entry) => (
          <li key={String(entry.dataKey)} className="flex items-center gap-2 text-xs">
            <span
              className="size-2 shrink-0 rounded-[2px]"
              style={{ background: entry.color }}
              aria-hidden
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto tnum font-medium text-foreground">
              {render(Number(entry.value ?? 0), valueFormat)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
