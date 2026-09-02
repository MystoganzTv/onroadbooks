"use client";

import { ChevronDown, CircleCheck, LockOpen, TriangleAlert } from "lucide-react";

import { ActionableProblemList } from "@/components/shared/actionable-problem";
import {
  CloseSettlementButton,
  ReopenSettlementButton,
} from "@/components/settlements/settlement-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/components/shell/language-provider";
import {
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  formatRateValue,
} from "@/lib/formatters";
import { formatLocaleDate } from "@/lib/i18n-format";
import { interpolate } from "@/lib/i18n/dictionaries";
import {
  selectActionableFinancialProblems,
  selectOwnerMoneyPresentation,
  type MoneyValue,
} from "@/lib/finance/presentation";
import type { SettlementView } from "@/lib/finance/settlement";
import { financialModelVersionOf } from "@/lib/finance/terminology";
import { cn } from "@/lib/utils";

/** A half-month payday view first, a frozen accounting statement second. */
export function SettlementDetail({ view }: { view: SettlementView }) {
  const { dictionary, locale } = useLanguage();
  const copy = dictionary.settlements;
  const figures = view.figures;
  const closed = view.status === "CLOSED";
  const calculationVersion = financialModelVersionOf(figures);
  const currentModel = calculationVersion >= 2;
  const bookedRevenue = figures.bookedRevenue ?? figures.grossRevenue;
  const presentation = selectOwnerMoneyPresentation({
    bookedRevenue,
    operatingProfit: figures.operatingProfit,
    collectedRevenue: currentModel ? (figures.collectedRevenue ?? null) : null,
    accountsReceivable: currentModel ? (figures.accountsReceivable ?? null) : null,
    unallocatedCollectedRevenue: currentModel
      ? (figures.unallocatedCollectedRevenue ?? null)
      : null,
    operatingExpenses: figures.operatingExpenses,
    debtService: currentModel ? (figures.debtService ?? null) : null,
    reserveTotal: figures.reserveTotal,
    safeToPay: currentModel ? figures.safeToPay : null,
    loadCount: figures.loadCount,
    totalMiles: figures.totalMiles,
    netMargin: bookedRevenue > 0 ? (figures.operatingProfit / bookedRevenue) * 100 : 0,
  });
  const problems = currentModel
    ? selectActionableFinancialProblems({
        unallocatedCollectedRevenue: figures.unallocatedCollectedRevenue ?? 0,
        unallocatedDebtService: figures.unallocatedDebtService ?? 0,
      })
    : [];
  const answers = presentation.answers;
  const available = presentation.availableToYou;
  const fundingGap = presentation.cashFundingGap;

  return (
    <div className="space-y-3">
      <ActionableProblemList problems={problems} />

      <Card className="overflow-hidden">
        <CardHeader className="flex-wrap">
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-primary">
              {copy.halfMonthPayday}
            </p>
            <CardTitle className="mt-1">
              {formatLocaleDate(view.range.start, locale, { month: "long", day: "numeric" })}
              –{formatLocaleDate(view.range.end, locale, { day: "numeric", year: "numeric" })}
            </CardTitle>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              {formatLocaleDate(view.range.start, locale)} – {formatLocaleDate(view.range.end, locale)}
              {closed && view.closedAt
                ? ` · ${copy.closed.toLowerCase()} ${formatLocaleDate(view.closedAt.slice(0, 10), locale)}`
                : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded border px-1.5 py-1 text-2xs font-semibold uppercase tracking-wide",
                closed
                  ? "border-pos/40 bg-pos-soft text-pos"
                  : "border-info/40 bg-info-soft text-info",
              )}
            >
              {closed ? <CircleCheck className="size-3" /> : <LockOpen className="size-3" />}
              {closed ? copy.settled : copy.live}
            </span>
            {closed ? (
              <ReopenSettlementButton id={view.id} />
            ) : (
              <CloseSettlementButton
                month={view.month}
                half={view.half}
                complete={view.complete}
                reserveTotal={formatMoney(figures.reserveTotal)}
              />
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="grid border-t border-border sm:grid-cols-2 xl:grid-cols-4 xl:divide-x xl:divide-border">
            <PrimaryAnswer label={copy.truckEarned} question={copy.earnedQuestion} value={answers.earned.value} tone="info" note={interpolate(copy.earnedNote, {
              count: figures.loadCount,
              unit: figures.loadCount === 1 ? copy.load : copy.loads.toLowerCase(),
              miles: formatNumber(figures.totalMiles),
            })} />
            <PrimaryAnswer label={copy.businessMade} question={copy.businessQuestion} value={answers.businessProfit.value} tone={figures.operatingProfit >= 0 ? "positive" : "negative"} note={interpolate(copy.businessNote, {
              margin: formatPercent(bookedRevenue > 0 ? (figures.operatingProfit / bookedRevenue) * 100 : 0),
            })} />
            <PrimaryAnswer label={copy.cashCollected} question={copy.collectedQuestion} value={answers.collected.value} tone="info" note={copy.cashWithDate} />
            <PrimaryAnswer label={copy.stillWaiting} question={copy.waitingQuestion} value={answers.stillWaiting.value} tone="warning" note={copy.waitingNote} />
          </div>

          <div className="grid gap-px border-t border-border bg-border sm:grid-cols-3">
            <CompactAnswer label={copy.businessExpenses} question={copy.spentQuestion} value={answers.spent.value} negative />
            <CompactAnswer label={copy.debtFinancing} question={copy.debtQuestion} value={answers.debtPayments.value} negative />
            <CompactAnswer label={copy.setAside} question={copy.setAsideQuestion} value={answers.setAside.value} />
          </div>

          <div
            className={cn(
              "border-t-2 px-5 py-5",
              available.state === "KNOWN" && available.amount > 0
                ? "border-pos/40 bg-pos-soft/45"
                : "border-info/35 bg-info-soft/30",
            )}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {copy.availableToYou}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {copy.availableExplanation}
                </p>
              </div>
              <MoneyValueText
                value={available}
                className={cn(
                  "text-4xl font-semibold leading-none tracking-tight",
                  available.state === "KNOWN" && available.amount > 0 ? "text-pos" : "text-info",
                )}
              />
            </div>
            {fundingGap.state === "KNOWN" && fundingGap.amount > 0 ? (
              <div className="mt-3 flex items-start gap-2 text-xs text-neg">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                <p className="tnum">
                  {interpolate(copy.cashShortfall, { amount: formatMoney(fundingGap.amount) })}
                </p>
              </div>
            ) : null}
          </div>

          <details className="group border-t border-border">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-medium text-muted-foreground hover:bg-accent/35 hover:text-foreground focus-ring">
              {interpolate(copy.financialDetails, { version: calculationVersion })}
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-border">
              <dl className="divide-y divide-border/70">
                <DetailRow label={currentModel ? copy.bookedRevenue : copy.grossLegacy} value={bookedRevenue} />
                <DetailRow label={copy.collectedRevenue} value={currentModel ? (figures.collectedRevenue ?? null) : null} />
                <DetailRow label={copy.accountsReceivable} value={currentModel ? (figures.accountsReceivable ?? null) : null} />
                <DetailRow label={copy.operatingExpenses} value={figures.operatingExpenses} negative />
                <DetailRow label={copy.operatingProfit} value={figures.operatingProfit} strong />
                <DetailRow label={copy.interestExpense} value={currentModel ? (figures.interestExpense ?? null) : null} />
                <DetailRow label={copy.principalPayment} value={currentModel ? (figures.principalPayment ?? null) : null} />
                <DetailRow label={copy.unallocatedDebt} value={currentModel ? (figures.unallocatedDebtService ?? null) : null} />
                <DetailRow label={copy.debtService} value={currentModel ? (figures.debtService ?? null) : null} negative />
                <DetailRow label={copy.cashAfterDebt} value={currentModel ? (figures.cashAfterDebtService ?? null) : null} strong />
                {figures.reserves.map((reserve) => (
                  <DetailRow
                    key={reserve.accountId}
                    label={reserve.name === "Tax Reserve" ? dictionary.reserves.taxReserve : reserve.name === "Maintenance Reserve" ? dictionary.reserves.maintenanceReserve : reserve.name}
                    hint={interpolate(copy.reserveBasis, {
                      percent: reserve.pct,
                      basis: reserve.basis === "OPERATING_PROFIT"
                        ? copy.operatingProfit
                        : currentModel ? copy.bookedRevenue : copy.grossRevenue,
                    })}
                    value={reserve.amount}
                    negative
                  />
                ))}
              </dl>

              <div className="grid grid-cols-2 gap-3 border-t border-border p-4 sm:grid-cols-4">
                <Figure label={copy.loads} value={formatNumber(figures.loadCount)} />
                <Figure label={copy.totalMiles} value={formatNumber(figures.totalMiles)} />
                <Figure label={copy.deadhead} value={formatPercent(figures.deadheadPct)} />
                <Figure label={copy.actualCostPerMile} value={figures.totalMiles > 0 ? formatRateValue(figures.trueCostPerMile) : copy.unknown} />
                <Figure label={copy.revenuePerMile} value={formatRateValue(figures.revenuePerMile)} />
                <Figure label={copy.profitPerMile} value={formatRateValue(figures.profitPerMile)} tone={figures.profitPerMile >= 0 ? "text-pos" : "text-neg"} />
                <Figure label={copy.fixedPerMile} value={formatRateValue(figures.fixedCostPerMile)} />
                <Figure label={copy.variablePerMile} value={formatRateValue(figures.variableCostPerMile)} />
              </div>
            </div>
          </details>

          <p className="border-t border-border px-4 py-2.5 text-2xs leading-relaxed text-muted-foreground">
            {closed
              ? interpolate(copy.frozenNote, { version: calculationVersion })
              : view.complete
                ? copy.liveCompleteNote
                : copy.liveRunningNote}
          </p>

          {view.drifted ? (
            <div className="flex flex-col gap-3 border-t border-warn/40 bg-warn-soft/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-2.5">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" />
                <div>
                  <p className="text-xs font-medium text-warn">{copy.driftTitle}</p>
                  <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground tnum">
                    {interpolate(copy.driftDescription, {
                      amount: formatMoney(Math.abs(view.driftAmount)),
                    })}
                  </p>
                </div>
              </div>
              <ReopenSettlementButton id={view.id} />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function PrimaryAnswer({ label, question, value, tone, note }: { label: string; question: string; value: MoneyValue; tone: "info" | "positive" | "negative" | "warning"; note: string }) {
  const color = tone === "positive" ? "text-pos" : tone === "negative" ? "text-neg" : tone === "warning" ? "text-warn" : "text-info";
  return (
    <div className="min-w-0 border-b border-border px-4 py-4 sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:[&:nth-child(odd)]:border-r-0" title={question}>
      <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <MoneyValueText value={value} className={cn("mt-2 text-2xl font-semibold tracking-tight", color)} />
      <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">{note}</p>
    </div>
  );
}

function CompactAnswer({ label, question, value, negative = false }: { label: string; question: string; value: MoneyValue; negative?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 bg-surface-sunken/55 px-4 py-3" title={question}>
      <span className="text-2xs text-muted-foreground">{label}</span>
      <MoneyValueText value={value} negative={negative} className={cn("text-sm font-semibold", negative ? "text-neg" : "text-warn")} />
    </div>
  );
}

function MoneyValueText({ value, className, negative = false }: { value: MoneyValue; className?: string; negative?: boolean }) {
  const { dictionary } = useLanguage();
  if (value.state === "UNKNOWN") {
    return <span className={cn("text-muted-foreground", className)} title={value.reason}>{dictionary.settlements.notEnoughData}</span>;
  }
  const amount = negative && value.amount > 0 ? -value.amount : value.amount;
  return <span className={cn("tnum", className)}>{formatMoneyCompact(amount)}</span>;
}

function DetailRow({ label, hint, value, negative = false, strong = false }: { label: string; hint?: string; value: number | null; negative?: boolean; strong?: boolean }) {
  const { dictionary } = useLanguage();
  return (
    <div className={cn("flex items-baseline justify-between gap-3 px-4 py-3", strong && "bg-surface-sunken/60")}>
      <dt className="min-w-0">
        <span className={cn("text-sm", strong ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</span>
        {hint ? <span className="ml-1.5 text-2xs text-muted-foreground/70">{hint}</span> : null}
      </dt>
      <dd className={cn("shrink-0 tnum", strong ? "text-lg font-semibold" : "text-md", negative ? "text-neg" : "text-foreground")}>
        {value === null ? dictionary.settlements.unknown : formatMoney(negative && value > 0 ? -value : value)}
      </dd>
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="label-xs truncate">{label}</p>
      <p className={cn("mt-0.5 text-md font-semibold tracking-tight tnum", tone)}>{value}</p>
    </div>
  );
}
