import { CircleCheck, LockOpen, TriangleAlert } from "lucide-react";

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
import type { SettlementView } from "@/lib/finance/settlement";
import { financialModelVersionOf } from "@/lib/finance/terminology";
import { cn } from "@/lib/utils";

/**
 * One settlement, in full.
 *
 * A CLOSED settlement renders its frozen snapshot, not a fresh calculation.
 * If the underlying rows have since moved, that is surfaced as a drift notice
 * rather than silently applied -- the whole point of closing is that the
 * number stops changing.
 */
export function SettlementDetail({ view }: { view: SettlementView }) {
  const figures = view.figures;
  const closed = view.status === "CLOSED";
  const calculationVersion = financialModelVersionOf(figures);
  const currentModel = calculationVersion >= 2;

  return (
    <Card>
      <CardHeader className="flex-wrap">
        <div className="min-w-0">
          <CardTitle>{view.label}</CardTitle>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            {formatDateMedium(view.range.start)} – {formatDateMedium(view.range.end)}
            {closed && view.closedAt
              ? ` · closed ${formatDateMedium(view.closedAt.slice(0, 10))}`
              : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded border px-1.5 py-1 text-2xs font-semibold uppercase tracking-wide",
              closed
                ? "border-pos/40 bg-pos-soft text-pos"
                : "border-info/40 bg-info-soft text-info",
            )}
          >
            {closed ? <CircleCheck className="size-3" /> : <LockOpen className="size-3" />}
            {closed ? "Closed" : "Open"}
          </span>
          <span className="rounded border border-border px-1.5 py-1 text-2xs text-muted-foreground">
            Model v{calculationVersion}
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
        <dl className="divide-y divide-border/70">
          <Row
            label={currentModel ? "Booked Revenue" : "Gross Revenue (legacy)"}
            value={formatMoney(figures.bookedRevenue ?? figures.grossRevenue)}
          />
          {currentModel ? (
            <>
              <Row label="Collected Revenue" value={formatMoney(figures.collectedRevenue ?? 0)} />
              {(figures.unallocatedCollectedRevenue ?? 0) > 0 ? (
                <Row
                  label="Paid Revenue without Payment Date"
                  hint="preserved; not assigned to a cash period"
                  value={formatMoney(figures.unallocatedCollectedRevenue ?? 0)}
                  tone="warn"
                />
              ) : null}
              <Row
                label="Accounts Receivable"
                hint="not available cash"
                value={formatMoney(figures.accountsReceivable ?? 0)}
                tone={(figures.accountsReceivable ?? 0) > 0 ? "warn" : undefined}
              />
            </>
          ) : null}
          <Row
            label="Operating Expenses"
            value={`-${formatMoney(figures.operatingExpenses)}`}
            tone="neg"
          />
          <Row
            label="Operating Profit"
            value={formatMoney(figures.operatingProfit)}
            strong
            className="bg-surface-sunken/60"
          />
          {currentModel ? (
            <>
              <Row label="Interest Expense" value={formatMoney(figures.interestExpense ?? 0)} />
              <Row label="Principal Payment" value={formatMoney(figures.principalPayment ?? 0)} />
              <Row
                label="Unallocated Debt Service"
                value={formatMoney(figures.unallocatedDebtService ?? 0)}
              />
              <Row
                label="Debt Service"
                value={`-${formatMoney(figures.debtService ?? 0)}`}
                tone="neg"
              />
              <Row
                label="Cash After Debt Service"
                value={formatMoney(figures.cashAfterDebtService ?? 0)}
                strong
                className="bg-surface-sunken/60"
              />
            </>
          ) : null}
          {figures.reserves.map((reserve) => (
            <Row
              key={reserve.accountId}
              label={reserve.name}
              hint={`${reserve.pct}% of ${
                reserve.basis === "OPERATING_PROFIT"
                  ? "Operating Profit"
                  : currentModel
                    ? "Booked Revenue"
                    : "Gross Revenue"
              }`}
              value={`-${formatMoney(reserve.amount)}`}
              tone="warn"
            />
          ))}
        </dl>

        <div
          className={cn(
            "flex items-end justify-between gap-3 border-t-2 px-4 py-4",
            figures.safeToPay >= 0
              ? "border-pos/40 bg-pos-soft/40"
              : "border-neg/40 bg-neg-soft/40",
          )}
        >
          <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Safe to Pay Yourself
          </span>
          <span
            className={cn(
              "tnum text-4xl font-semibold leading-none tracking-tight",
              figures.safeToPay >= 0 ? "text-pos" : "text-neg",
            )}
          >
            {formatMoneyCompact(figures.safeToPay)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-border p-4 sm:grid-cols-4">
          <Figure label="Loads" value={formatNumber(figures.loadCount)} />
          <Figure label="Total miles" value={formatNumber(figures.totalMiles)} />
          <Figure label="Deadhead" value={formatPercent(figures.deadheadPct)} />
          <Figure
            label={currentModel ? "Actual cost / mile" : "True cost / mile (legacy)"}
            value={figures.totalMiles > 0 ? formatRateValue(figures.trueCostPerMile) : "—"}
          />
          <Figure label="Booked Revenue / mile" value={formatRateValue(figures.revenuePerMile)} />
          <Figure
            label={currentModel ? "Operating Profit / mile" : "Profit / mile (legacy)"}
            value={formatRateValue(figures.profitPerMile)}
            tone={figures.profitPerMile >= 0 ? "text-pos" : "text-neg"}
          />
          <Figure label="Fixed / mile" value={formatRateValue(figures.fixedCostPerMile)} />
          <Figure label="Variable / mile" value={formatRateValue(figures.variableCostPerMile)} />
        </div>

        {closed ? (
          <p className="border-t border-border px-4 py-2.5 text-2xs leading-relaxed text-muted-foreground">
            These model v{calculationVersion} figures were frozen when the settlement closed.
            Changing a reserve percentage, editing a load, or shipping a newer calculation model
            does not rewrite them.
          </p>
        ) : (
          <p className="border-t border-border px-4 py-2.5 text-2xs leading-relaxed text-muted-foreground">
            {view.complete
              ? "Live figures. Closing freezes them and posts the reserves above into your buckets."
              : "Live figures. This period is still running, so it cannot be closed yet."}
          </p>
        )}

        {view.drifted ? (
          <div className="flex items-start gap-2.5 border-t border-warn/40 bg-warn-soft/50 px-4 py-3">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-warn">
                The underlying data has changed since this closed
              </p>
              <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground tnum">
                Recalculating today would give {formatMoney(view.live.safeToPay)} instead of{" "}
                {formatMoney(view.figures.safeToPay)}, a difference of{" "}
                {formatMoney(Math.abs(view.driftAmount))}. Reopen and close again if you want the
                settlement to reflect it.
              </p>
            </div>
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
    <div className={cn("flex items-baseline justify-between gap-3 px-4 py-3", className)}>
      <dt className="min-w-0">
        <span
          className={cn(
            "text-sm",
            strong ? "font-semibold text-foreground" : "text-muted-foreground",
          )}
        >
          {label}
        </span>
        {hint ? <span className="ml-1.5 text-2xs text-muted-foreground/70">{hint}</span> : null}
      </dt>
      <dd
        className={cn(
          "shrink-0 tnum",
          strong ? "text-lg font-semibold" : "text-md",
          tone === "neg" ? "text-neg" : tone === "warn" ? "text-warn" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="label-xs truncate">{label}</p>
      <p className={cn("mt-0.5 tnum text-md font-semibold tracking-tight", tone)}>{value}</p>
    </div>
  );
}
