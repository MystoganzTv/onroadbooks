import Link from "next/link";
import { ArrowUpRight, ThumbsDown, Trophy } from "lucide-react";

import { LoadScoreBadge } from "@/components/cockpit/load-score-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatDateShort,
  formatMoneyCompact,
  formatPercent,
  formatRateValue,
} from "@/lib/formatters";
import type { ScoredLoad } from "@/lib/finance/load-score";
import { cn } from "@/lib/utils";

interface BestWorstLoadsProps {
  best?: ScoredLoad;
  worst?: ScoredLoad;
  periodQuery: string;
  periodLabel: string;
}

/** The two loads worth looking at: the one to repeat and the one to learn from. */
export function BestWorstLoads({ best, worst, periodQuery, periodLabel }: BestWorstLoadsProps) {
  if (!best) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No loads recorded in {periodLabel} yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <LoadCard load={best} kind="best" periodQuery={periodQuery} />
      {worst ? (
        <LoadCard load={worst} kind="worst" periodQuery={periodQuery} />
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex h-full items-center justify-center p-6 text-center">
            <p className="text-xs text-muted-foreground">
              A second load in {periodLabel} will show the weakest one here for comparison.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LoadCard({
  load,
  kind,
  periodQuery,
}: {
  load: ScoredLoad;
  kind: "best" | "worst";
  periodQuery: string;
}) {
  const Icon = kind === "best" ? Trophy : ThumbsDown;

  return (
    <Card className="group relative overflow-hidden transition-colors hover:border-primary/50">
      <span
        className={cn(
          "absolute inset-x-0 top-0 h-0.5",
          kind === "best" ? "bg-pos" : "bg-neg",
        )}
        aria-hidden
      />
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon
            className={cn("size-3.5", kind === "best" ? "text-pos" : "text-neg")}
          />
          <CardTitle>{kind === "best" ? "Best load" : "Worst load"}</CardTitle>
        </div>
        <LoadScoreBadge score={load.score} />
      </CardHeader>

      <CardContent className="space-y-3 p-4">
        <div>
          {/* The whole card is the target; the link carries the accessible name
              and stretches over the card so the click area matches the visual. */}
          <Link
            href={`/loads/${load.id}?${periodQuery}`}
            className="focus-ring after:absolute after:inset-0 after:content-['']"
          >
            <span className="flex items-center gap-1 text-md font-semibold tracking-tight">
              <span className="truncate">
                {load.originCity}, {load.originState} → {load.destinationCity},{" "}
                {load.destinationState}
              </span>
              <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </span>
          </Link>
          <p className="mt-0.5 truncate text-2xs text-muted-foreground">
            {formatDateShort(load.date)}
            {load.broker ? ` · ${load.broker}` : ""} ·{" "}
            {Math.round(load.metrics.totalMiles).toLocaleString()} mi
          </p>
        </div>

        <dl className="grid grid-cols-4 gap-2">
          <Figure label="Gross" value={formatMoneyCompact(load.grossRate)} />
          <Figure
            label="Contribution"
            value={formatMoneyCompact(load.metrics.tripProfit)}
            tone={load.metrics.tripProfit >= 0 ? "text-pos" : "text-neg"}
          />
          <Figure
            label="Contribution / mi"
            value={formatRateValue(load.metrics.profitPerMile)}
            tone={load.metrics.profitPerMile >= 0 ? "text-pos" : "text-neg"}
          />
          <Figure label="Deadhead" value={formatPercent(load.metrics.deadheadPct, 0)} />
        </dl>
      </CardContent>
    </Card>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="label-xs truncate">{label}</dt>
      <dd className={cn("mt-0.5 tnum text-sm font-semibold tracking-tight", tone)}>{value}</dd>
    </div>
  );
}
