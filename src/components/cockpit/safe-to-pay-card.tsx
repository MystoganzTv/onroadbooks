import Link from "next/link";
import { Info, PiggyBank } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatMoney, formatMoneyCompact } from "@/lib/formatters";
import type { OwnerPay } from "@/lib/finance/owner-pay";
import { cn } from "@/lib/utils";

interface SafeToPayCardProps {
  ownerPay: OwnerPay;
  periodLabel: string;
  /** Link through to the settlement or reserves detail, when there is one. */
  href?: string;
  className?: string;
}

/**
 * SAFE TO PAY YOURSELF.
 *
 * The signature number. Deliberately shown as a stack that walks down from
 * revenue, because the answer is only trustworthy if the subtraction is
 * visible. It is a planning figure derived from the owner's own reserve
 * settings -- not a bank balance, and not tax advice.
 */
export function SafeToPayCard({ ownerPay, periodLabel, href, className }: SafeToPayCardProps) {
  const positive = ownerPay.safeToPay >= 0;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <PiggyBank className="size-3.5 text-muted-foreground" />
          <CardTitle>Safe to Pay Yourself</CardTitle>
        </div>
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger
              className="rounded p-0.5 text-muted-foreground focus-ring hover:text-foreground"
              aria-label="How this number is calculated"
            >
              <Info className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent className="max-w-[17rem] text-2xs leading-relaxed">
              Collected Revenue for {periodLabel}, less cash operating expenses, Debt Service and
              planned Reserve Contributions. Accounts Receivable never increases this figure. It
              is a planning ceiling, not a bank balance or tax advice.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardHeader>

      <CardContent className="space-y-0 p-0">
        <dl className="divide-y divide-border/70">
          <Row label="Booked Revenue" value={formatMoney(ownerPay.bookedRevenue)} />
          <Row
            label="Accounts Receivable"
            hint="performance, not available cash"
            value={formatMoney(ownerPay.accountsReceivable)}
            tone={ownerPay.accountsReceivable > 0 ? "warn" : undefined}
          />
          <Row label="Collected Revenue" value={formatMoney(ownerPay.collectedRevenue)} strong />
          {ownerPay.unallocatedCollectedRevenue > 0 ? (
            <Row
              label="Paid Revenue without Payment Date"
              hint="preserved; not assigned to a cash period"
              value={formatMoney(ownerPay.unallocatedCollectedRevenue)}
              tone="warn"
            />
          ) : null}
          <Row
            label="Cash Operating Expenses"
            value={
              ownerPay.operatingExpenses > 0
                ? `-${formatMoney(ownerPay.operatingExpenses)}`
                : formatMoney(0)
            }
            tone={ownerPay.operatingExpenses > 0 ? "neg" : undefined}
          />
          <Row
            label="Debt Service"
            hint="interest + principal + unsplit payments"
            value={ownerPay.debtService > 0 ? `-${formatMoney(ownerPay.debtService)}` : formatMoney(0)}
            tone={ownerPay.debtService > 0 ? "neg" : undefined}
          />
          <Row
            label="Cash After Debt Service"
            value={formatMoney(ownerPay.cashAfterDebtService)}
            strong
            className="bg-surface-sunken/60"
          />
          {ownerPay.reserves.map((reserve) => (
            <Row
              key={reserve.accountId}
              label={reserve.name}
              hint={`${reserve.pct}% of ${
                reserve.basis === "OPERATING_PROFIT" ? "Operating Profit" : "Booked Revenue"
              }`}
              value={reserve.amount > 0 ? `-${formatMoney(reserve.amount)}` : formatMoney(0)}
              tone={reserve.amount > 0 ? "warn" : undefined}
            />
          ))}
        </dl>

        <div
          className={cn(
            "flex items-end justify-between gap-3 border-t-2 px-4 py-4",
            positive ? "border-pos/40 bg-pos-soft/50" : "border-neg/40 bg-neg-soft/50",
          )}
        >
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Safe to Pay Yourself
            </p>
            <p className="mt-0.5 text-2xs text-muted-foreground">{periodLabel}</p>
          </div>
          <p
            className={cn(
              "shrink-0 text-4xl font-semibold tnum leading-none tracking-tight",
              positive ? "text-pos" : "text-neg",
            )}
          >
            {formatMoneyCompact(ownerPay.safeToPay)}
          </p>
        </div>

        {href ? (
          <div className="border-t border-border px-4 py-2.5">
            <Link
              href={href}
              className="text-2xs font-medium text-primary underline-offset-2 hover:underline focus-ring"
            >
              Open the settlement for this period
            </Link>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  hint,
  value,
  tone,
  strong,
  className,
}: {
  label: string;
  hint?: string;
  value: string;
  tone?: "neg" | "warn";
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 px-4 py-2.5", className)}>
      <dt className="min-w-0">
        <span className={cn("text-xs", strong ? "font-semibold text-foreground" : "text-muted-foreground")}>
          {label}
        </span>
        {hint ? <span className="ml-1.5 text-2xs text-muted-foreground/70">{hint}</span> : null}
      </dt>
      <dd
        className={cn(
          "shrink-0 tnum tabular-nums",
          strong ? "text-md font-semibold" : "text-sm",
          tone === "neg" ? "text-neg" : tone === "warn" ? "text-warn" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
