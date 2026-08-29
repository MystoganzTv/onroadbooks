import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { DeltaBadge } from "@/components/shared/delta-badge";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "positive" | "negative" | "warning" | "info";

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-foreground",
  positive: "text-pos",
  negative: "text-neg",
  warning: "text-warn",
  info: "text-info",
};

const TONE_ICON: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  positive: "text-pos",
  negative: "text-neg",
  warning: "text-warn",
  info: "text-info",
};

interface KpiCardProps {
  label: string;
  value: string;
  tone?: Tone;
  icon?: LucideIcon;
  sub?: ReactNode;
  delta?: { value: number; higherIsBetter?: boolean };
  /** Larger treatment for the headline metrics. */
  emphasis?: boolean;
  className?: string;
}

export function KpiCard({
  label,
  value,
  tone = "neutral",
  icon: Icon,
  sub,
  delta,
  emphasis = false,
  className,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between rounded-lg border border-border bg-card p-3",
        emphasis && "p-3.5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="label-xs">{label}</p>
        {Icon ? <Icon className={cn("size-3.5 shrink-0", TONE_ICON[tone])} /> : null}
      </div>
      <p
        className={cn(
          "mt-2 font-semibold tnum tracking-tight",
          emphasis ? "text-3xl" : "text-2xl",
          TONE_TEXT[tone],
        )}
      >
        {value}
      </p>
      <div className="mt-1.5 flex min-h-[1.125rem] flex-wrap items-center gap-x-2 gap-y-0.5">
        {delta ? (
          <DeltaBadge value={delta.value} higherIsBetter={delta.higherIsBetter} />
        ) : null}
        {sub ? <span className="text-2xs text-muted-foreground tnum">{sub}</span> : null}
      </div>
    </div>
  );
}
