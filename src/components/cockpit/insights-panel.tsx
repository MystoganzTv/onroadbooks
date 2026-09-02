"use client";

import { Lightbulb, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";

import { useLanguage } from "@/components/shell/language-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RankedInsight } from "@/lib/finance/insights";
import { cn } from "@/lib/utils";

const TONE = {
  positive: { icon: TrendingUp, text: "text-pos", dot: "bg-pos" },
  negative: { icon: TrendingDown, text: "text-neg", dot: "bg-neg" },
  warning: { icon: TriangleAlert, text: "text-warn", dot: "bg-warn" },
  neutral: { icon: Lightbulb, text: "text-info", dot: "bg-info" },
} as const;

/**
 * Deterministic observations, highest priority first. Every line is
 * reproducible by hand from the ledger -- nothing here is generated text.
 */
export function InsightsPanel({
  insights,
  limit = 5,
  className,
}: {
  insights: RankedInsight[];
  limit?: number;
  className?: string;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.dashboard;
  const shown = insights.slice(0, limit);

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lightbulb className="size-3.5 text-muted-foreground" />
          <CardTitle>{copy.whatNumbersSay}</CardTitle>
        </div>
        <span className="text-2xs text-muted-foreground">{copy.calculatedNotGenerated}</span>
      </CardHeader>
      <CardContent className="p-0">
        {shown.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">
            {copy.insufficientInsights}
          </p>
        ) : (
          <ul className="divide-y divide-border/70">
            {shown.map((insight) => {
              const tone = TONE[insight.tone];
              const Icon = tone.icon;
              return (
                <li key={insight.id} className="flex items-start gap-2.5 px-4 py-2.5">
                  <Icon className={cn("mt-0.5 size-3.5 shrink-0", tone.text)} />
                  <p className="text-xs leading-relaxed text-foreground">{insight.text}</p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
