import { ChevronDown, CircleCheck, LockOpen, TriangleAlert } from "lucide-react";

import { ActionableProblemList } from "@/components/shared/actionable-problem";
import {
  CloseSettlementButton,
  ReopenSettlementButton,
} from "@/components/settlements/settlement-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatDateMedium,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  formatRateValue,
} from "@/lib/formatters";
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
              Half-month payday
            </p>
            <CardTitle className="mt-1">{view.label}</CardTitle>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              {formatDateMedium(view.range.start)} – {formatDateMedium(view.range.end)}
              {closed && view.closedAt
                ? ` · closed ${formatDateMedium(view.closedAt.slice(0, 10))}`
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
              {closed ? "Settled" : "Live"}
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
            <PrimaryAnswer label="Your truck earned" question={answers.earned.question} value={answers.earned.value} tone="info" note={answers.earned.explanation} />
            <PrimaryAnswer label="Your business made" question={answers.businessProfit.question} value={answers.businessProfit.value} tone={figures.operatingProfit >= 0 ? "positive" : "negative"} note={answers.businessProfit.explanation} />
            <PrimaryAnswer label="Cash collected" question={answers.collected.question} value={answers.collected.value} tone="info" note="Cash with a payment date" />
            <PrimaryAnswer label="Still waiting" question={answers.stillWaiting.question} value={answers.stillWaiting.value} tone="warning" note="Owed or still needing a payment date" />
          </div>

          <div className="grid gap-px border-t border-border bg-border sm:grid-cols-3">
            <CompactAnswer label="Business cash out" question={answers.spent.question} value={answers.spent.value} negative />
            <CompactAnswer label="Debt payments" question={answers.debtPayments.question} value={answers.debtPayments.value} negative />
            <CompactAnswer label="Set aside" question={answers.setAside.question} value={answers.setAside.value} />
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
                  Available to pay yourself
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  After business costs, debt payments, and planned reserves.
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
                  You made money, but cash obligations exceed recorded collections by{" "}
                  {formatMoney(fundingGap.amount)}.
                </p>
              </div>
            ) : null}
          </div>

          <details className="group border-t border-border">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-medium text-muted-foreground hover:bg-accent/35 hover:text-foreground focus-ring">
              Financial details · model v{calculationVersion}
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-border">
              <dl className="divide-y divide-border/70">
                <DetailRow label={currentModel ? "Booked Revenue" : "Gross Revenue (legacy)"} value={bookedRevenue} />
                <DetailRow label="Collected Revenue" value={currentModel ? (figures.collectedRevenue ?? null) : null} />
                <DetailRow label="Accounts Receivable" value={currentModel ? (figures.accountsReceivable ?? null) : null} />
                <DetailRow label="Operating Expenses" value={figures.operatingExpenses} negative />
                <DetailRow label="Operating Profit" value={figures.operatingProfit} strong />
                <DetailRow label="Interest Expense" value={currentModel ? (figures.interestExpense ?? null) : null} />
                <DetailRow label="Principal Payment" value={currentModel ? (figures.principalPayment ?? null) : null} />
                <DetailRow label="Unallocated Debt Service" value={currentModel ? (figures.unallocatedDebtService ?? null) : null} />
                <DetailRow label="Debt Service" value={currentModel ? (figures.debtService ?? null) : null} negative />
                <DetailRow label="Cash After Debt Service" value={currentModel ? (figures.cashAfterDebtService ?? null) : null} strong />
                {figures.reserves.map((reserve) => (
                  <DetailRow
                    key={reserve.accountId}
                    label={reserve.name}
                    hint={`${reserve.pct}% of ${reserve.basis === "OPERATING_PROFIT" ? "Operating Profit" : currentModel ? "Booked Revenue" : "Gross Revenue"}`}
                    value={reserve.amount}
                    negative
                  />
                ))}
              </dl>

              <div className="grid grid-cols-2 gap-3 border-t border-border p-4 sm:grid-cols-4">
                <Figure label="Loads" value={formatNumber(figures.loadCount)} />
                <Figure label="Total miles" value={formatNumber(figures.totalMiles)} />
                <Figure label="Deadhead" value={formatPercent(figures.deadheadPct)} />
                <Figure label="Actual cost / mile" value={figures.totalMiles > 0 ? formatRateValue(figures.trueCostPerMile) : "Unknown"} />
                <Figure label="Revenue / mile" value={formatRateValue(figures.revenuePerMile)} />
                <Figure label="Business profit / mile" value={formatRateValue(figures.profitPerMile)} tone={figures.profitPerMile >= 0 ? "text-pos" : "text-neg"} />
                <Figure label="Fixed / mile" value={formatRateValue(figures.fixedCostPerMile)} />
                <Figure label="Variable / mile" value={formatRateValue(figures.variableCostPerMile)} />
              </div>
            </div>
          </details>

          <p className="border-t border-border px-4 py-2.5 text-2xs leading-relaxed text-muted-foreground">
            {closed
              ? `These model v${calculationVersion} figures were frozen when the settlement closed.`
              : view.complete
                ? "Live figures. Closing freezes this payday view and posts the reserve targets above."
                : "Live figures. This half-month is still running, so it cannot be settled yet."}
          </p>

          {view.drifted ? (
            <div className="flex flex-col gap-3 border-t border-warn/40 bg-warn-soft/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-2.5">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" />
                <div>
                  <p className="text-xs font-medium text-warn">The books changed after this payday was settled</p>
                  <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground tnum">
                    Recalculating now changes available cash by {formatMoney(Math.abs(view.driftAmount))}.
                    Reopen it to review the updated figures, then settle it again if they are correct.
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
  if (value.state === "UNKNOWN") {
    return <span className={cn("text-muted-foreground", className)} title={value.reason}>Not enough data</span>;
  }
  const amount = negative && value.amount > 0 ? -value.amount : value.amount;
  return <span className={cn("tnum", className)}>{formatMoneyCompact(amount)}</span>;
}

function DetailRow({ label, hint, value, negative = false, strong = false }: { label: string; hint?: string; value: number | null; negative?: boolean; strong?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 px-4 py-3", strong && "bg-surface-sunken/60")}>
      <dt className="min-w-0">
        <span className={cn("text-sm", strong ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</span>
        {hint ? <span className="ml-1.5 text-2xs text-muted-foreground/70">{hint}</span> : null}
      </dt>
      <dd className={cn("shrink-0 tnum", strong ? "text-lg font-semibold" : "text-md", negative ? "text-neg" : "text-foreground")}>
        {value === null ? "Unknown" : formatMoney(negative && value > 0 ? -value : value)}
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
