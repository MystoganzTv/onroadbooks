import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

import { formatDelta } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface DeltaBadgeProps {
  /** Percentage change. */
  value: number;
  /** When false, a rise is bad (e.g. cost per mile). */
  higherIsBetter?: boolean;
  label?: string;
  className?: string;
}

export function DeltaBadge({
  value,
  higherIsBetter = true,
  label,
  className,
}: DeltaBadgeProps) {
  const flat = Math.abs(value) < 0.05;
  const good = higherIsBetter ? value > 0 : value < 0;
  const Icon = flat ? ArrowRight : value > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-2xs font-medium tnum",
        flat ? "text-muted-foreground" : good ? "text-pos" : "text-neg",
        className,
      )}
    >
      <Icon className="size-3" />
      {flat ? "0.0%" : formatDelta(value)}
      {label ? <span className="ml-0.5 font-normal text-muted-foreground">{label}</span> : null}
    </span>
  );
}
