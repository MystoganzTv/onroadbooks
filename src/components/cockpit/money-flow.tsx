import { ArrowDown, ChevronDown, CircleDollarSign } from "lucide-react";

import { categoryColor } from "@/lib/categories";
import { formatMoney, formatMoneyCompact, formatPercent } from "@/lib/formatters";
import type { OwnerPay } from "@/lib/finance/owner-pay";
import { selectOwnerMoneyPresentation } from "@/lib/finance/presentation";
import { isOperatingExpenseCategory } from "@/lib/finance/terminology";
import type { CategoryTotal } from "@/lib/types";
import { cn } from "@/lib/utils";

interface MoneyFlowProps {
  ownerPay: OwnerPay;
  categories: CategoryTotal[];
  periodLabel: string;
  maxRows?: number;
  className?: string;
  showOwnerPlanning?: boolean;
}

/** The signature explanation of profit, cash, obligations, and availability. */
export function MoneyFlow({
  ownerPay,
  categories,
  periodLabel,
  maxRows = 6,
  className,
  showOwnerPlanning = true,
}: MoneyFlowProps) {
  const presentation = selectOwnerMoneyPresentation({
    ...ownerPay,
    safeToPay: ownerPay.safeToPay,
    netMargin: ownerPay.bookedRevenue > 0
      ? (ownerPay.operatingProfit / ownerPay.bookedRevenue) * 100
      : 0,
  });
  const answers = presentation.answers;
  const revenue = ownerPay.bookedRevenue;
  const width = (value: number) =>
    revenue > 0 ? `${Math.max(1.5, Math.min(100, (Math.abs(value) / revenue) * 100))}%` : "1.5%";

  const operatingCategories = categories.filter((category) =>
    isOperatingExpenseCategory(category.category),
  );
  const shown = operatingCategories.slice(0, maxRows);
  const restTotal = operatingCategories.slice(maxRows).reduce((total, row) => total + row.amount, 0);
  const rows = restTotal > 0
    ? [...shown, { category: "OTHER" as const, label: "Everything else", amount: restTotal, share: 0, behavior: "VARIABLE" as const, count: 0 }]
    : shown;
  const available = presentation.availableToYou.state === "KNOWN"
    ? presentation.availableToYou.amount
    : null;
  const fundingGap = presentation.cashFundingGap.state === "KNOWN"
    ? presentation.cashFundingGap.amount
    : null;
  const stillWaiting = answers.stillWaiting.value.state === "KNOWN"
    ? answers.stillWaiting.value.amount
    : null;

  if (revenue <= 0 && ownerPay.operatingExpenses <= 0) {
    return (
      <div className={cn("rounded-lg border border-dashed border-border bg-card p-8 text-center", className)}>
        <p className="text-sm text-muted-foreground">No money activity recorded for {periodLabel}.</p>
      </div>
    );
  }

  return (
    <section className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      <header className="flex items-start gap-3 border-b border-border px-4 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-info/25 bg-info-soft text-info">
          <CircleDollarSign className="size-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold">Where is my money?</h3>
          <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">
            One path from work completed to cash that is actually free to take.
          </p>
        </div>
      </header>

      <div className="grid lg:grid-cols-2">
        <div className="border-b border-border lg:border-b-0 lg:border-r">
          <FlowHeading label="Performance · what the business produced" />
          <FlowRow label="You earned" question="How much did I earn?" value={revenue} tone="info" width={width(revenue)} />

          <div className="space-y-2 border-t border-border px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                <ArrowDown className="size-3" /> Business expenses
              </span>
              <span className="text-sm font-semibold text-neg tnum">-{formatMoney(ownerPay.operatingExpenses)}</span>
            </div>
            {rows.length === 0 ? (
              <p className="text-xs text-muted-foreground">No business expenses in this period.</p>
            ) : (
              <ul className="space-y-1.5">
                {rows.map((row) => (
                  <li key={row.category + row.label} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-2.5">
                    <span className="truncate text-xs text-muted-foreground">{row.label}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: width(row.amount), backgroundColor: categoryColor(row.category) }}
                      />
                    </span>
                    <span className="text-xs text-neg tnum">-{formatMoney(row.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <FlowRow
            label="Your business made"
            question="How much did the business make?"
            value={ownerPay.operatingProfit}
            tone={ownerPay.operatingProfit >= 0 ? "positive" : "negative"}
            width={width(ownerPay.operatingProfit)}
            note={revenue > 0 ? `${formatPercent((ownerPay.operatingProfit / revenue) * 100)} margin after operating costs` : undefined}
          />
        </div>

        <div>
          <FlowHeading label="Cash · what is available now" />
          <FlowRow label="You collected" question="How much did I collect?" value={ownerPay.collectedRevenue} tone="info" width={width(ownerPay.collectedRevenue)} />
          {stillWaiting !== null && stillWaiting > 0 ? (
            <FlowRow
              label="Still waiting"
              question="How much is still owed or needs a payment date?"
              value={stillWaiting}
              tone="warning"
              width={width(stillWaiting)}
              note="Not counted as available cash"
            />
          ) : null}
          <FlowRow label="Business cash out" question="How much did I spend?" value={-ownerPay.operatingExpenses} tone="negative" width={width(ownerPay.operatingExpenses)} />
          <FlowRow label="Debt payments" question="How much went to debt?" value={-ownerPay.debtService} tone="negative" width={width(ownerPay.debtService)} />

          {showOwnerPlanning ? (
            <div className={cn("border-t-2 px-4 py-4", (available ?? 0) > 0 ? "border-pos/40 bg-pos-soft/40" : "border-info/35 bg-info-soft/30")}>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Available to you</p>
                  <p className="mt-1 text-2xs text-muted-foreground">How much can I take?</p>
                </div>
                <span className={cn("text-3xl font-semibold tracking-tight tnum", (available ?? 0) > 0 ? "text-pos" : "text-info")}>
                  {available === null ? "Not enough data" : formatMoneyCompact(available)}
                </span>
              </div>
              {fundingGap !== null && fundingGap > 0 ? (
                <p className="mt-2 text-xs text-neg tnum">
                  Funding gap: {formatMoney(fundingGap)}
                </p>
              ) : null}
            </div>
          ) : null}

          {showOwnerPlanning && ownerPay.reserves.length > 0 ? (
            <div className="border-t border-border bg-surface-sunken/45 px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  When cash is available
                </p>
                <p className="text-xs font-semibold text-warn tnum">
                  Suggested set aside: {formatMoneyCompact(ownerPay.reserveTotal)}
                </p>
              </div>
              <p className="mt-1 text-2xs text-muted-foreground">
                Recommended reserves are not added to today&apos;s funding gap.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <details className="group border-t border-border">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-medium text-muted-foreground hover:bg-accent/35 hover:text-foreground focus-ring">
          Financial details
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        </summary>
        <dl className="grid gap-px border-t border-border bg-border/70 sm:grid-cols-2 lg:grid-cols-4">
          <Detail label="Booked Revenue" value={ownerPay.bookedRevenue} />
          <Detail label="Collected Revenue" value={ownerPay.collectedRevenue} />
          <Detail label="Accounts Receivable" value={ownerPay.accountsReceivable} />
          <Detail label="Operating Profit" value={ownerPay.operatingProfit} />
          <Detail label="Interest Expense" value={ownerPay.interestExpense} />
          <Detail label="Principal Payment" value={ownerPay.principalPayment} />
          <Detail label="Debt Service" value={ownerPay.debtService} />
          <Detail label="Cash After Debt Service" value={ownerPay.cashAfterDebtService} />
        </dl>
      </details>
    </section>
  );
}

function FlowHeading({ label }: { label: string }) {
  return <p className="bg-surface-sunken/60 px-4 py-2.5 text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>;
}

function FlowRow({ label, question, value, width, tone, note }: { label: string; question: string; value: number; width: string; tone: "info" | "positive" | "negative" | "warning"; note?: string }) {
  const color = tone === "positive" ? "text-pos" : tone === "negative" ? "text-neg" : tone === "warning" ? "text-warn" : "text-info";
  const bar = tone === "positive" ? "bg-pos" : tone === "negative" ? "bg-neg" : tone === "warning" ? "bg-warn" : "bg-info";
  return (
    <div className="border-t border-border px-4 py-3" title={question}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={cn("text-lg font-semibold tracking-tight tnum", color)}>{formatMoneyCompact(value)}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
        <div className={cn("h-full rounded-full", bar)} style={{ width }} />
      </div>
      {note ? <p className="mt-1 text-2xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card px-4 py-3">
      <dt className="text-2xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-foreground tnum">{formatMoney(value)}</dd>
    </div>
  );
}
