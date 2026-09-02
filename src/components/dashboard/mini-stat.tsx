import { MiniStatHelp } from "@/components/dashboard/mini-stat-help";
import { cn } from "@/lib/utils";

interface MiniStatProps {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative" | "warning" | "info";
  sub?: string;
  className?: string;
  /** Short plain-language explanation shown from the info button. */
  help?: string;
  /** Let dense summary grids show their full labels instead of clipping them. */
  wrapText?: boolean;
}

const TONE: Record<string, string> = {
  neutral: "text-foreground",
  positive: "text-pos",
  negative: "text-neg",
  warning: "text-warn",
  info: "text-info",
};

/** Second-row operational metric -- denser than a KPI card. */
export function MiniStat({
  label,
  value,
  tone = "neutral",
  sub,
  className,
  help,
  wrapText = false,
}: MiniStatProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-card px-3.5 py-3", className)}>
      <div className="flex items-start justify-between gap-2">
        <p
          className={cn(
            "label-xs min-w-0",
            wrapText ? "min-h-8 whitespace-normal leading-4" : "truncate",
          )}
        >
          {label}
        </p>
        {help ? <MiniStatHelp label={label}>{help}</MiniStatHelp> : null}
      </div>
      <p className={cn("mt-1 text-xl font-semibold tnum tracking-tight", TONE[tone])}>
        {value}
      </p>
      {sub ? (
        <p
          className={cn(
            "mt-0.5 text-2xs text-muted-foreground tnum",
            wrapText ? "min-h-8 whitespace-normal leading-4" : "truncate",
          )}
        >
          {sub}
        </p>
      ) : null}
    </div>
  );
}
