import { cn } from "@/lib/utils";

interface MiniStatProps {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative" | "warning" | "info";
  sub?: string;
  className?: string;
}

const TONE: Record<string, string> = {
  neutral: "text-foreground",
  positive: "text-pos",
  negative: "text-neg",
  warning: "text-warn",
  info: "text-info",
};

/** Second-row operational metric -- denser than a KPI card. */
export function MiniStat({ label, value, tone = "neutral", sub, className }: MiniStatProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-card px-3.5 py-3", className)}>
      <p className="label-xs truncate">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold tnum tracking-tight", TONE[tone])}>
        {value}
      </p>
      {sub ? <p className="mt-0.5 truncate text-2xs text-muted-foreground tnum">{sub}</p> : null}
    </div>
  );
}
