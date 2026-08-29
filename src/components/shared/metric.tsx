import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface MetricProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  className?: string;
  valueClassName?: string;
}

/** Compact label/value pair used inside panels and detail views. */
export function Metric({ label, value, sub, className, valueClassName }: MetricProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="label-xs">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold tnum tracking-tight", valueClassName)}>
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-2xs text-muted-foreground tnum">{sub}</p> : null}
    </div>
  );
}
