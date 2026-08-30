import type { LucideIcon } from "lucide-react";
import { Banknote, Gauge, TrendingDown, TrendingUp, Wallet } from "lucide-react";

import { DeltaBadge } from "@/components/shared/delta-badge";
import { formatMoneyCompact, formatRate } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { OwnerPay } from "@/lib/finance/owner-pay";
import type { PeriodSummary } from "@/lib/types";

interface HeroMetricsProps {
  summary: PeriodSummary;
  previous: PeriodSummary;
  ownerPay: OwnerPay;
  previousLabel: string;
  deltas: { revenue: number; profit: number; profitPerMile: number };
}

/**
 * The four numbers that answer "am I making money" in five seconds.
 *
 * Revenue, net profit, what is actually free to take, and what a mile
 * returned. Everything else on the page is context for these.
 */
export function HeroMetrics({
  summary,
  ownerPay,
  previousLabel,
  deltas,
}: HeroMetricsProps) {
  const profitable = summary.netProfit >= 0;

  return (
    <div className="grid h-full grid-cols-2 gap-3">
      <HeroTile
        label="Revenue"
        value={formatMoneyCompact(summary.grossRevenue)}
        icon={Banknote}
        tone="info"
        delta={deltas.revenue}
        sub={`vs ${previousLabel}`}
      />
      <HeroTile
        label="Net Profit"
        value={formatMoneyCompact(summary.netProfit)}
        icon={profitable ? TrendingUp : TrendingDown}
        tone={profitable ? "positive" : "negative"}
        delta={deltas.profit}
        sub={`${summary.netMargin.toFixed(1)}% margin`}
      />
      <HeroTile
        label="Available Cash"
        value={formatMoneyCompact(ownerPay.safeToPay)}
        icon={Wallet}
        tone={ownerPay.safeToPay >= 0 ? "positive" : "negative"}
        sub={`after ${formatMoneyCompact(ownerPay.reserveTotal)} of reserves`}
      />
      <HeroTile
        label="Profit / Mile"
        value={formatRate(summary.profitPerMile)}
        icon={Gauge}
        tone={summary.profitPerMile >= 0 ? "positive" : "negative"}
        delta={deltas.profitPerMile}
        sub={`over ${Math.round(summary.totalMiles).toLocaleString()} mi`}
      />
    </div>
  );
}

type Tone = "info" | "positive" | "negative";

const TONE_TEXT: Record<Tone, string> = {
  info: "text-info",
  positive: "text-pos",
  negative: "text-neg",
};

const TONE_EDGE: Record<Tone, string> = {
  info: "bg-info",
  positive: "bg-pos",
  negative: "bg-neg",
};

function HeroTile({
  label,
  value,
  icon: Icon,
  tone,
  sub,
  delta,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: Tone;
  sub: string;
  delta?: number;
}) {
  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-lg border border-border bg-card p-4 pl-5">
      {/* A colour spine rather than a coloured card: the number stays the
          loudest thing on the tile. */}
      <span className={cn("absolute inset-y-0 left-0 w-1", TONE_EDGE[tone])} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <p className="label-xs">{label}</p>
        <Icon className={cn("size-4 shrink-0", TONE_TEXT[tone])} />
      </div>
      <p
        className={cn(
          "mt-2.5 text-3xl font-semibold tnum leading-none tracking-tight sm:text-[2rem]",
          TONE_TEXT[tone],
        )}
      >
        {value}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {delta !== undefined ? <DeltaBadge value={delta} /> : null}
        <span className="text-2xs text-muted-foreground tnum">{sub}</span>
      </div>
    </div>
  );
}
