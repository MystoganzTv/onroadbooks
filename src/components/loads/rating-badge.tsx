import { CircleAlert, CircleCheck, CircleMinus, TrendingUp } from "lucide-react";

import { formatRateValue } from "@/lib/formatters";
import type { ProfitabilityRating } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Colour semantics for the rating, applied consistently everywhere:
 * green great, blue-green good, amber marginal, red bad.
 */
export const RATING_STYLE: Record<
  ProfitabilityRating,
  { label: string; chip: string; text: string; dot: string; icon: typeof CircleCheck }
> = {
  GREAT: {
    label: "Great",
    chip: "border-pos/40 bg-pos-soft text-pos",
    text: "text-pos",
    dot: "bg-pos",
    icon: TrendingUp,
  },
  GOOD: {
    label: "Good",
    chip: "border-info/40 bg-info-soft text-info",
    text: "text-info",
    dot: "bg-info",
    icon: CircleCheck,
  },
  MARGINAL: {
    label: "Marginal",
    chip: "border-warn/40 bg-warn-soft text-warn",
    text: "text-warn",
    dot: "bg-warn",
    icon: CircleMinus,
  },
  BAD: {
    label: "Bad",
    chip: "border-neg/40 bg-neg-soft text-neg",
    text: "text-neg",
    dot: "bg-neg",
    icon: CircleAlert,
  },
};

export function RatingBadge({
  rating,
  className,
}: {
  rating: ProfitabilityRating;
  className?: string;
}) {
  const style = RATING_STYLE[rating];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-1 text-2xs font-semibold uppercase tracking-wide",
        style.chip,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", style.dot)} aria-hidden />
      {style.label}
    </span>
  );
}

/** The headline verdict: "GREAT LOAD -- $2.34 profit/mile". */
export function RatingVerdict({
  rating,
  profitPerMile,
  className,
}: {
  rating: ProfitabilityRating;
  profitPerMile: number;
  className?: string;
}) {
  const style = RATING_STYLE[rating];
  const Icon = style.icon;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-md border px-3.5 py-3",
        style.chip,
        className,
      )}
    >
      <span className="flex items-center gap-2">
        <Icon className="size-4 shrink-0" />
        <span className="text-lg font-semibold uppercase tracking-wide">
          {style.label} load
        </span>
      </span>
      <span className="text-right">
        <span className="block tnum text-2xl font-semibold leading-none">
          {formatRateValue(profitPerMile)}
        </span>
        <span className="text-2xs opacity-80">profit / mile</span>
      </span>
    </div>
  );
}
