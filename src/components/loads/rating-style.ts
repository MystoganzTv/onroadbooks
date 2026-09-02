import { CircleAlert, CircleCheck, CircleMinus, TrendingUp } from "lucide-react";

import type { ProfitabilityRating } from "@/lib/types";

/**
 * Shared presentation metadata for load ratings.
 *
 * This module deliberately has no `use client` boundary: both the interactive
 * rating components and Server Components such as the load detail page need
 * to read these plain values while rendering.
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
