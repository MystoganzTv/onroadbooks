import {
  Banknote,
  ChartNoAxesCombined,
  Gauge,
  ReceiptText,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { DeltaBadge } from "@/components/shared/delta-badge";
import { formatMoneyCompact, formatRate } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { PeriodSummary } from "@/lib/types";

interface HeroMetricsProps {
  summary: PeriodSummary;
  previousLabel: string;
  deltas: { revenue: number; profit: number; profitPerMile: number };
}

/**
 * The executive read of the period. This is intentionally one composed
 * surface rather than four equal KPI cards: operating profit is the answer,
 * while revenue, rate and costs explain it.
 */
export function HeroMetrics({
  summary,
  previousLabel,
  deltas,
}: HeroMetricsProps) {
  const profitable = summary.operatingProfit >= 0;
  const marginWidth = Math.max(0, Math.min(100, summary.netMargin));

  return (
    <section className="relative overflow-hidden rounded-xl border border-border bg-card shadow-[0_18px_50px_-38px_rgba(0,0,0,0.75)]">
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-28 opacity-70",
          profitable
            ? "bg-[radial-gradient(ellipse_at_top_left,hsl(var(--pos)/0.16),transparent_62%)]"
            : "bg-[radial-gradient(ellipse_at_top_left,hsl(var(--neg)/0.16),transparent_62%)]",
        )}
        aria-hidden
      />

      <header className="relative flex flex-wrap items-center justify-between gap-3 border-b border-border/80 px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "grid size-9 place-items-center rounded-lg border",
              profitable
                ? "border-pos/25 bg-pos-soft text-pos"
                : "border-neg/25 bg-neg-soft text-neg",
            )}
          >
            <ChartNoAxesCombined className="size-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Financial performance</h3>
            <p className="mt-0.5 text-2xs text-muted-foreground">Period operating result</p>
          </div>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-semibold uppercase tracking-[0.12em]",
            profitable
              ? "border-pos/30 bg-pos-soft text-pos"
              : "border-neg/30 bg-neg-soft text-neg",
          )}
        >
          {profitable ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
          {profitable ? "Profitable" : "Needs attention"}
        </span>
      </header>

      <div className="relative grid md:grid-cols-[minmax(0,1.35fr)_minmax(15rem,0.95fr)]">
        <div className="border-b border-border/80 px-5 py-5 md:border-b-0 md:border-r">
          <p className="label-xs">Operating profit</p>
          <p
            className={cn(
              "mt-3 text-[clamp(2.35rem,4vw,3.75rem)] font-semibold tnum leading-none tracking-[-0.045em]",
              profitable ? "text-pos" : "text-neg",
            )}
          >
            {formatMoneyCompact(summary.operatingProfit)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <DeltaBadge value={deltas.profit} label={`vs ${previousLabel}`} />
            <span className="text-2xs text-muted-foreground">·</span>
            <span className="text-2xs text-muted-foreground tnum">
              {summary.netMargin.toFixed(1)}% operating margin
            </span>
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between text-2xs text-muted-foreground">
              <span>Revenue retained after operating costs</span>
              <span className="font-medium text-foreground tnum">{summary.netMargin.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
              <div
                className={cn("h-full rounded-full", profitable ? "bg-pos" : "bg-neg")}
                style={{ width: `${marginWidth}%` }}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-border/80 md:grid-cols-1 md:divide-x-0 md:divide-y">
          <SupportingMetric
            label="Booked revenue"
            value={formatMoneyCompact(summary.bookedRevenue)}
            icon={Banknote}
            tone="info"
          >
            <DeltaBadge value={deltas.revenue} label={`vs ${previousLabel}`} />
          </SupportingMetric>
          <SupportingMetric
            label="Profit per mile"
            value={formatRate(summary.profitPerMile)}
            icon={Gauge}
            tone={summary.profitPerMile >= 0 ? "positive" : "negative"}
          >
            <DeltaBadge value={deltas.profitPerMile} />
            <span className="text-2xs text-muted-foreground tnum">
              across {Math.round(summary.totalMiles).toLocaleString()} mi
            </span>
          </SupportingMetric>
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-border/80 border-t border-border/80 bg-surface-sunken/45">
        <FooterMetric
          label="Operating expenses"
          value={formatMoneyCompact(summary.operatingExpenses)}
          icon={ReceiptText}
        />
        <FooterMetric label="Actual cost / mi" value={formatRate(summary.costPerMile)} icon={Gauge} />
        <FooterMetric label="Revenue / mi" value={formatRate(summary.revenuePerMile)} icon={TrendingUp} />
      </div>
    </section>
  );
}

type SupportingTone = "info" | "positive" | "negative";

function SupportingMetric({
  label,
  value,
  icon: Icon,
  tone,
  children,
}: {
  label: string;
  value: string;
  icon: typeof Banknote;
  tone: SupportingTone;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "info" ? "text-info" : tone === "positive" ? "text-pos" : "text-neg";

  return (
    <div className="min-w-0 px-4 py-4 sm:px-5">
      <div className="flex items-center justify-between gap-2">
        <p className="label-xs">{label}</p>
        <Icon className={cn("size-3.5 shrink-0", toneClass)} />
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tnum tracking-tight", toneClass)}>{value}</p>
      <div className="mt-1.5 flex min-h-4 flex-wrap items-center gap-x-2 gap-y-1">{children}</div>
    </div>
  );
}

function FooterMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Gauge;
}) {
  return (
    <div className="min-w-0 px-3 py-3.5 sm:px-4">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="hidden size-3 shrink-0 sm:block" />
        <p className="truncate text-[0.625rem] font-semibold uppercase tracking-[0.1em]">{label}</p>
      </div>
      <p className="mt-1.5 truncate text-sm font-semibold tnum text-foreground sm:text-base">{value}</p>
    </div>
  );
}
