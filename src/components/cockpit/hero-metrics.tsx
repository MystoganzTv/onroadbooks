import {
  CircleDollarSign,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";

import { DeltaBadge } from "@/components/shared/delta-badge";
import { formatMoneyCompact, formatRate } from "@/lib/formatters";
import type {
  MoneyValue,
  OwnerMoneyPresentation,
} from "@/lib/finance/presentation";
import type { FinancialSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { appText, type AppLocale } from "@/lib/i18n";

interface HeroMetricsProps {
  summary: FinancialSummary;
  presentation: OwnerMoneyPresentation;
  previousLabel: string;
  deltas: { revenue: number; profit: number; profitPerMile: number };
  showOwnerPlanning?: boolean;
  locale?: AppLocale;
}

/** Profit and cash are peers, never one blended accounting conclusion. */
export function HeroMetrics({
  summary,
  presentation,
  previousLabel,
  deltas,
  showOwnerPlanning = true,
  locale = "en",
}: HeroMetricsProps) {
  const tx = (english: string, spanish: string) => appText(locale, english, spanish);
  const answers = presentation.answers;
  const profitable = summary.operatingProfit >= 0;
  const fundingGap = presentation.cashFundingGap.state === "KNOWN"
    ? presentation.cashFundingGap.amount
    : null;

  return (
    <div className="grid gap-3 xl:grid-cols-[1.08fr_0.92fr]">
      <section
        className={cn(
          "overflow-hidden rounded-xl border shadow-[0_20px_55px_-42px_rgba(0,0,0,0.85)]",
          profitable
            ? "border-pos/30 bg-[linear-gradient(145deg,hsl(var(--pos)/0.16),hsl(var(--card))_64%)]"
            : "border-neg/30 bg-[linear-gradient(145deg,hsl(var(--neg)/0.15),hsl(var(--card))_64%)]",
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
          <div className="flex items-center gap-2">
            <CircleDollarSign className={cn("size-4", profitable ? "text-pos" : "text-neg")} />
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground">
              {tx("Financial performance", "Rendimiento financiero")}
            </h2>
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-semibold uppercase tracking-[0.12em]",
              profitable
                ? "border-pos/35 bg-pos-soft text-pos"
                : "border-neg/35 bg-neg-soft text-neg",
            )}
          >
            {profitable ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {profitable ? tx("Profitable", "Rentable") : tx("Loss", "Pérdida")}
          </span>
        </header>

        <div className="px-5 py-6">
          <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {tx("Your business made", "Tu negocio produjo")}
          </p>
          <p
            className={cn(
              "mt-2 text-[clamp(2.75rem,5vw,4.75rem)] font-semibold leading-none tracking-[-0.055em] tnum",
              profitable ? "text-pos" : "text-neg",
            )}
          >
            {formatMoneyCompact(summary.operatingProfit)}
          </p>
          <div className="mt-3">
            <DeltaBadge value={deltas.profit} label={`vs ${previousLabel}`} />
          </div>
        </div>

        <dl className="grid gap-px border-t border-border/70 bg-border/70 sm:grid-cols-3">
          <PerformanceFact label={tx("You earned", "Ganaste")} value={formatMoneyCompact(summary.bookedRevenue)} tone="info" />
          <PerformanceFact label={tx("Business expenses", "Gastos del negocio")} value={`-${formatMoneyCompact(summary.operatingExpenses)}`} tone="negative" />
          <PerformanceFact label={tx("Profit / mile", "Ganancia / milla")} value={formatRate(summary.profitPerMile)} tone={profitable ? "positive" : "negative"} />
        </dl>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_20px_55px_-42px_rgba(0,0,0,0.85)]">
        <header className="flex items-center gap-2 border-b border-border px-5 py-4">
          <WalletCards className="size-4 text-info" />
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground">{tx("Your cash", "Tu efectivo")}</h2>
            <p className="mt-0.5 text-2xs text-muted-foreground">{tx("What came in and what had to go out", "Lo que entró y lo que tuvo que salir")}</p>
          </div>
        </header>

        <dl className="divide-y divide-border/70 px-5">
          <CashFact label={tx("Collected", "Cobrado")} value={answers.collected.value} tone="info" locale={locale} />
          <CashFact label={tx("Business cash out", "Efectivo que salió del negocio")} value={answers.spent.value} tone="negative" negative locale={locale} />
          <CashFact label={tx("Debt payments", "Pagos de deuda")} value={answers.debtPayments.value} tone="negative" negative locale={locale} />
        </dl>

        {showOwnerPlanning ? (
          <div className="border-t-2 border-info/35 bg-info-soft/25 px-5 py-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {tx("Available to you", "Disponible para ti")}
                </p>
                <p className="mt-1 text-2xs text-muted-foreground">{tx("How much can I take?", "¿Cuánto puedo retirar?")}</p>
              </div>
              <MoneyValueText
                value={presentation.availableToYou}
                className="text-4xl font-semibold leading-none tracking-[-0.045em] text-info"
                locale={locale}
              />
            </div>
            {fundingGap !== null && fundingGap > 0 ? (
              <p className="mt-3 border-t border-neg/20 pt-3 text-sm font-semibold text-neg tnum">
                {tx("Cash still needed", "Efectivo que aún falta")}: {formatMoneyCompact(fundingGap)}
              </p>
            ) : null}
          </div>
        ) : null}

        {showOwnerPlanning && summary.reserves.length > 0 ? (
          <div className="border-t border-border bg-surface-sunken/45 px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {tx("When cash is available", "Cuando haya efectivo disponible")}
              </p>
              <p className="text-xs font-semibold text-warn tnum">
                {tx("Suggested set aside", "Reserva sugerida")}: {formatMoneyCompact(summary.reserveTotal)}
              </p>
            </div>
            <dl className="mt-2 space-y-1.5">
              {summary.reserves.map((reserve) => (
                <div key={reserve.accountId} className="flex items-baseline justify-between gap-3 text-2xs">
                  <dt className="text-muted-foreground">{reserveLabel(reserve.kind, reserve.name, locale)}</dt>
                  <dd className="font-medium text-foreground tnum">{formatMoneyCompact(reserve.amount)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function PerformanceFact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "info" | "positive" | "negative";
}) {
  const color = tone === "positive" ? "text-pos" : tone === "negative" ? "text-neg" : "text-info";
  return (
    <div className="bg-card/80 px-5 py-4">
      <dt className="text-2xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 text-lg font-semibold tracking-tight tnum", color)}>{value}</dd>
    </div>
  );
}

function CashFact({
  label,
  value,
  tone,
  negative = false,
  locale = "en",
}: {
  label: string;
  value: MoneyValue;
  tone: "info" | "negative";
  negative?: boolean;
  locale?: AppLocale;
}) {
  const display = value.state === "KNOWN"
    ? `${negative && value.amount > 0 ? "-" : ""}${formatMoneyCompact(value.amount)}`
    : null;
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-base font-semibold tnum", tone === "negative" ? "text-neg" : "text-info")}>
        {display ?? <span className="text-xs text-muted-foreground">{appText(locale, "Not enough data", "Datos insuficientes")}</span>}
      </dd>
    </div>
  );
}

function MoneyValueText({ value, className, locale = "en" }: { value: MoneyValue; className?: string; locale?: AppLocale }) {
  if (value.state === "UNKNOWN") {
    return (
      <p className={cn("text-sm text-muted-foreground", className)} title={value.reason}>
        {appText(locale, "Not enough data", "Datos insuficientes")}
      </p>
    );
  }
  return <p className={cn("tnum", className)}>{formatMoneyCompact(value.amount)}</p>;
}

function reserveLabel(kind: string, name: string, locale: AppLocale): string {
  if (kind === "TAX") return appText(locale, "Suggested tax set-aside", "Reserva sugerida para impuestos");
  if (kind === "MAINTENANCE") return appText(locale, "Suggested maintenance set-aside", "Reserva sugerida para mantenimiento");
  return locale === "es"
    ? `Reserva sugerida para ${name.toLocaleLowerCase()}`
    : `Suggested ${name.toLocaleLowerCase()} set-aside`;
}
