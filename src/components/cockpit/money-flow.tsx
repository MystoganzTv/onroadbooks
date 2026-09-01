import { ArrowDown } from "lucide-react";

import { categoryColor } from "@/lib/categories";
import { formatMoney, formatMoneyCompact, formatPercent } from "@/lib/formatters";
import type { OwnerPay } from "@/lib/finance/owner-pay";
import type { CategoryTotal } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isOperatingExpenseCategory } from "@/lib/finance/terminology";

interface MoneyFlowProps {
  ownerPay: OwnerPay;
  categories: CategoryTotal[];
  periodLabel: string;
  /** Categories past this many are folded into one "Other" row. */
  maxRows?: number;
  className?: string;
  showOwnerPlanning?: boolean;
}

/**
 * WHERE DID MY MONEY GO
 * =====================
 *
 * A waterfall, not a table. Every bar is drawn as a share of gross revenue,
 * so the eye reads the proportions before it reads a single figure: the block
 * that is obviously half the width of the revenue bar IS half the revenue.
 *
 * Revenue -> each expense category -> operating profit -> each reserve ->
 * safe to pay yourself. Nothing is aggregated away that the owner would want
 * to see, and nothing is invented that is not in the ledger.
 */
export function MoneyFlow({
  ownerPay,
  categories,
  periodLabel,
  maxRows = 7,
  className,
  showOwnerPlanning = true,
}: MoneyFlowProps) {
  const revenue = ownerPay.bookedRevenue;
  const width = (value: number) =>
    revenue > 0 ? `${Math.max(1.5, Math.min(100, (Math.abs(value) / revenue) * 100))}%` : "1.5%";

  const operatingCategories = categories.filter((category) =>
    isOperatingExpenseCategory(category.category),
  );
  const shown = operatingCategories.slice(0, maxRows);
  const restTotal = operatingCategories.slice(maxRows).reduce((total, c) => total + c.amount, 0);
  const rows = restTotal > 0
    ? [...shown, { category: "OTHER" as const, label: "Everything else", amount: restTotal, share: 0, behavior: "VARIABLE" as const, count: 0 }]
    : shown;

  if (revenue <= 0 && ownerPay.operatingExpenses <= 0) {
    return (
      <div className={cn("rounded-lg border border-dashed border-border bg-card p-8 text-center", className)}>
        <p className="text-sm text-muted-foreground">
          No revenue or expenses recorded for {periodLabel}.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}>
      {/* Revenue in */}
      <div className="border-b border-border bg-info-soft/50 px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Booked Revenue · Performance
          </span>
          <span className="tnum text-2xl font-semibold tracking-tight text-info">
            {formatMoneyCompact(revenue)}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-info/20">
          <div className="h-full w-full rounded-full bg-info" />
        </div>
      </div>

      {/* Operating expenses out */}
      <div className="space-y-2 px-4 py-3">
        <div className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          <ArrowDown className="size-3" />
          Operating Expenses
        </div>
        {rows.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">
            No operating expenses recorded in {periodLabel}.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((row) => (
              <li key={row.category + row.label} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-2.5">
                <span className="truncate text-xs text-muted-foreground">{row.label}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-surface-sunken">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: width(row.amount),
                      // Category colours are the same ones the expense donut
                      // uses, so a category is the same colour app-wide.
                      backgroundColor: categoryColor(row.category),
                    }}
                  />
                </span>
                <span className="tnum text-xs text-neg">-{formatMoney(row.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Operating profit */}
      <StepRow
        label="Operating Profit"
        value={ownerPay.operatingProfit}
        barWidth={width(ownerPay.operatingProfit)}
        tone="foreground"
        note={
          revenue > 0
            ? `${formatPercent((ownerPay.operatingProfit / revenue) * 100)} of Booked Revenue`
            : undefined
        }
      />

      <StepRow
        label="Collected Revenue · Cash"
        value={ownerPay.collectedRevenue}
        barWidth={width(ownerPay.collectedRevenue)}
        tone="foreground"
        note={
          ownerPay.accountsReceivable > 0
            ? `${formatMoney(ownerPay.accountsReceivable)} remains in Accounts Receivable`
            : "No Accounts Receivable in this performance period"
        }
      />

      {ownerPay.unallocatedCollectedRevenue > 0 ? (
        <StepRow
          label="Paid Revenue without Payment Date"
          value={ownerPay.unallocatedCollectedRevenue}
          barWidth={width(ownerPay.unallocatedCollectedRevenue)}
          tone="foreground"
          note="Preserved as paid; not silently assigned to a cash period"
        />
      ) : null}

      <StepRow
        label="Cash After Debt Service"
        value={ownerPay.cashAfterDebtService}
        barWidth={width(ownerPay.cashAfterDebtService)}
        tone="foreground"
        note={`${formatMoney(ownerPay.debtService)} of Debt Service paid`}
      />

      {/* Reserves out */}
      {showOwnerPlanning && ownerPay.reserves.length > 0 ? (
        <div className="space-y-2 border-t border-border px-4 py-3">
          <div className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            <ArrowDown className="size-3" />
            Set aside
          </div>
          <ul className="space-y-1.5">
            {ownerPay.reserves.map((reserve) => (
              <li
                key={reserve.accountId}
                className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-2.5"
              >
                <span className="truncate text-xs text-muted-foreground">{reserve.name}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-surface-sunken">
                  <span
                    className="block h-full rounded-full bg-warn"
                    style={{ width: width(reserve.amount) }}
                  />
                </span>
                <span className="tnum text-xs text-warn">-{formatMoney(reserve.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* What is left */}
      {showOwnerPlanning ? (
        <div
          className={cn(
            "border-t-2 px-4 py-4",
            ownerPay.safeToPay >= 0
              ? "border-pos/40 bg-pos-soft/40"
              : "border-neg/40 bg-neg-soft/40",
          )}
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Safe to Pay Yourself
            </span>
            <span
              className={cn(
                "tnum text-3xl font-semibold tracking-tight",
                ownerPay.safeToPay >= 0 ? "text-pos" : "text-neg",
              )}
            >
              {formatMoneyCompact(ownerPay.safeToPay)}
            </span>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div
              className={cn(
                "h-full rounded-full",
                ownerPay.safeToPay >= 0 ? "bg-pos" : "bg-neg",
              )}
              style={{ width: width(ownerPay.safeToPay) }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StepRow({
  label,
  value,
  barWidth,
  note,
}: {
  label: string;
  value: number;
  barWidth: string;
  tone: "foreground";
  note?: string;
}) {
  return (
    <div className="border-t border-border bg-surface-sunken/60 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        <span className="tnum text-xl font-semibold tracking-tight text-foreground">
          {formatMoneyCompact(value)}
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border/60">
        <div className="h-full rounded-full bg-foreground/70" style={{ width: barWidth }} />
      </div>
      {note ? <p className="mt-1 text-2xs text-muted-foreground tnum">{note}</p> : null}
    </div>
  );
}
