import type { Metadata } from "next";
import { Landmark } from "lucide-react";

import { ReserveAccountDialog } from "@/components/reserves/reserve-account-dialog";
import {
  DeleteReserveAccountButton,
  DeleteReserveTransactionButton,
} from "@/components/reserves/reserve-row-actions";
import { ReserveTransactionDialog } from "@/components/reserves/reserve-transaction-dialog";
import { MiniStat } from "@/components/dashboard/mini-stat";
import { PeriodControls } from "@/components/dashboard/period-controls";
import { PageHeader } from "@/components/shared/page-header";
import { PlanGate } from "@/components/shared/plan-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { calculateReserveBalances, totalReserved } from "@/lib/finance/reserves";
import { resolveReserveRules } from "@/lib/finance/owner-pay";
import {
  formatDateShort,
  formatMoney,
  formatMoneyCompact,
  formatPercent,
} from "@/lib/formatters";
import { periodFromSearchParams, type SearchParams } from "@/lib/period-params";
import { planAllows } from "@/lib/plans";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Reserves" };

/**
 * RESERVE BUCKETS.
 *
 * Balances are a running sum of signed movements, never a stored figure.
 * Contributions post automatically when a settlement closes; withdrawals and
 * corrections are entered by hand.
 */
export default async function ReservesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const session = await requireSession();
  const { settings, reserveAccounts, reserveTransactions, subscription } = await getRepository(
    session.businessId,
  ).getDataset();

  if (!planAllows(subscription, "cockpit")) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <PageHeader
          title="Reserves"
          description="Virtual buckets, not bank accounts. What you are setting aside, and whether it is enough."
        />
        <PlanGate
          capability="cockpit"
          what="Set money aside for tax and the truck as each settlement closes, and see whether the buckets are keeping up."
        />
      </div>
    );
  }
  const period = periodFromSearchParams(params);

  const balances = calculateReserveBalances(reserveAccounts, reserveTransactions, period);
  const rules = resolveReserveRules(settings, reserveAccounts);
  const total = totalReserved(balances);
  const periodIn = balances.reduce((sum, b) => sum + b.periodContributions, 0);
  const periodOut = balances.reduce((sum, b) => sum + b.periodWithdrawals, 0);

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title="Reserve Buckets"
        description="Virtual buckets for tax, maintenance and anything else you set aside. Planning ledgers, not bank accounts."
        actions={
          <>
            <ReserveAccountDialog />
            <ReserveTransactionDialog accounts={reserveAccounts} />
          </>
        }
      />

      <PeriodControls period={period} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat label="Total reserved" value={formatMoneyCompact(total)} sub="all buckets" />
        <MiniStat
          label="Added"
          value={formatMoneyCompact(periodIn)}
          sub={period.shortLabel}
          tone="positive"
        />
        <MiniStat
          label="Taken out"
          value={formatMoneyCompact(periodOut)}
          sub={period.shortLabel}
          tone="warning"
        />
        <MiniStat
          label="Buckets"
          value={String(balances.filter((b) => b.account.active).length)}
          sub="active"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {balances.map((balance) => {
          const rule = rules.find((r) => r.accountId === balance.account.id);
          const builtIn =
            balance.account.kind === "TAX" || balance.account.kind === "MAINTENANCE";

          return (
            <Card key={balance.account.id} className="min-w-0">
              <CardHeader className="flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Landmark className="size-3.5 text-muted-foreground" />
                    <CardTitle>{balance.account.name}</CardTitle>
                  </div>
                  <p className="mt-0.5 text-2xs text-muted-foreground">
                    {rule && rule.pct > 0
                      ? `${formatPercent(rule.pct, rule.pct % 1 === 0 ? 0 : 1)} of ${
                          balance.account.basis === "OPERATING_PROFIT"
                            ? "operating profit"
                            : "gross revenue"
                        } each settlement`
                      : "No automatic contribution set"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <ReserveAccountDialog account={balance.account} />
                  {!builtIn ? (
                    <DeleteReserveAccountButton
                      id={balance.account.id}
                      name={balance.account.name}
                    />
                  ) : null}
                </div>
              </CardHeader>

              <CardContent className="p-0">
                <div className="px-4 py-3.5">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="label-xs">Current balance</p>
                      <p
                        className={cn(
                          "mt-0.5 tnum text-3xl font-semibold leading-none tracking-tight",
                          balance.balance >= 0 ? "text-foreground" : "text-neg",
                        )}
                      >
                        {formatMoneyCompact(balance.balance)}
                      </p>
                    </div>
                    <div className="text-right text-2xs text-muted-foreground tnum">
                      <p className="text-pos">+{formatMoney(balance.contributions)} in</p>
                      <p className="text-warn">-{formatMoney(balance.withdrawals)} out</p>
                    </div>
                  </div>

                  {balance.account.targetBalance ? (
                    <div className="mt-3">
                      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            (balance.targetProgress ?? 0) >= 100 ? "bg-pos" : "bg-info",
                          )}
                          style={{
                            width: `${Math.min(100, Math.max(0, balance.targetProgress ?? 0))}%`,
                          }}
                        />
                      </div>
                      <p className="mt-1 text-2xs text-muted-foreground tnum">
                        {Math.round(balance.targetProgress ?? 0)}% of a{" "}
                        {formatMoneyCompact(balance.account.targetBalance)} target
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="border-t border-border">
                  <div className="flex items-center justify-between gap-2 px-4 py-2">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Movements
                    </p>
                    <ReserveTransactionDialog
                      accounts={reserveAccounts}
                      defaultAccountId={balance.account.id}
                      trigger={
                        <button
                          type="button"
                          className="text-2xs font-medium text-primary underline-offset-2 hover:underline focus-ring"
                        >
                          Add
                        </button>
                      }
                    />
                  </div>

                  {balance.transactions.length === 0 ? (
                    <p className="px-4 pb-3 text-2xs text-muted-foreground">
                      Nothing recorded yet. Close a settlement and the contribution posts here.
                    </p>
                  ) : (
                    <ul className="max-h-64 divide-y divide-border/70 overflow-y-auto">
                      {balance.transactions.slice(0, 12).map((txn) => (
                        <li
                          key={txn.id}
                          className="flex items-center justify-between gap-2 px-4 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs text-foreground">{txn.description}</p>
                            <p className="text-2xs text-muted-foreground tnum">
                              {formatDateShort(txn.date)}
                              {txn.settlementId ? " · from a closed settlement" : ""}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <span
                              className={cn(
                                "tnum text-xs font-medium",
                                txn.amount >= 0 ? "text-pos" : "text-warn",
                              )}
                            >
                              {txn.amount >= 0 ? "+" : "-"}
                              {formatMoney(Math.abs(txn.amount))}
                            </span>
                            <DeleteReserveTransactionButton
                              id={txn.id}
                              label={txn.description}
                              posted={Boolean(txn.settlementId)}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-2xs leading-relaxed text-muted-foreground">
        A balance here is the running sum of its movements, never a stored figure, so it always
        matches the list above it. Contributions post when you close a settlement; if you reopen
        that settlement they are reversed, and anything you entered by hand is left alone.
      </p>
    </div>
  );
}
