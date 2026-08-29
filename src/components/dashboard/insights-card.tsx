import { Lightbulb, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Insight } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICON = {
  positive: TrendingUp,
  negative: TrendingDown,
  warning: TriangleAlert,
  neutral: Lightbulb,
} as const;

const TONE = {
  positive: "text-pos",
  negative: "text-neg",
  warning: "text-warn",
  neutral: "text-info",
} as const;

export function InsightsCard({ insights }: { insights: Insight[] }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lightbulb className="size-3.5 text-muted-foreground" />
          <CardTitle>Insights</CardTitle>
        </div>
        <span className="text-2xs text-muted-foreground">Calculated, not guessed</span>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border/70">
          {insights.slice(0, 6).map((insight) => {
            const Icon = ICON[insight.tone];
            return (
              <li key={insight.id} className="flex items-start gap-2.5 px-4 py-2.5">
                <Icon className={cn("mt-0.5 size-3.5 shrink-0", TONE[insight.tone])} />
                <p className="text-sm leading-snug text-foreground/90">{insight.text}</p>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
