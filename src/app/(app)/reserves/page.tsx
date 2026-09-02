import type { Metadata } from "next";
import { Building2, Landmark, Truck as TruckIcon } from "lucide-react";

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
import { summarizePeriod } from "@/lib/calculations";
import { getRepository } from "@/lib/db";
import { orderedTrucks } from "@/lib/fleet";
import {
  calculateReserveBalances,
  calculateTruckMaintenanceReserves,
  totalReserved,
} from "@/lib/finance/reserves";
import { calculateSafeOwnerPay, resolveReserveRules } from "@/lib/finance/owner-pay";
import {
  formatDateShort,
  formatMoney,
  formatMoneyCompact,
  formatPercent,
} from "@/lib/formatters";
import { periodFromSearchParams, type SearchParams } from "@/lib/period-params";
import { planAllows } from "@/lib/plans";
import { roleCan } from "@/lib/roles";
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
  if (!roleCan(session.role ?? "VIEWER", "manage_owner_finances")) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <PageHeader title="Reserves" description="Owner planning workspace." />
        <Card className="mx-auto max-w-2xl">
          <CardContent className="p-6 text-sm leading-relaxed text-muted-foreground">
            Reserve balances, rules and movements are available only to the workspace owner.
          </CardContent>
        </Card>
      </div>
    );
  }
  const {
    loads,
    expenses,
    settings,
    reserveAccounts,
    reserveTransactions,
    subscription,
    paymentEvents,
    trucks,
  } = await getRepository(session.businessId).getDataset();

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
  const ownerPay = calculateSafeOwnerPay(
    summarizePeriod(loads, expenses, period, settings, paymentEvents),
    rules,
  );
  const maintenanceRule = rules.find((rule) => rule.kind === "MAINTENANCE");
  const maintenanceByTruck =
    maintenanceRule?.basis === "GROSS_REVENUE"
      ? calculateTruckMaintenanceReserves(
          orderedTrucks(trucks),
          loads,
          period,
          maintenanceRule.pct,
        )
      : [];
  const total = totalReserved(balances);
  const periodIn = balances.reduce((sum, b) => sum + b.periodContributions, 0);
  const periodOut = balances.reduce((sum, b) => sum + b.periodWithdrawals, 0);

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title="Company Reserves · Whole Fleet"
        description="Company-level planning buckets. Tax stays consolidated; maintenance is explained by truck below. These are planning ledgers, not bank accounts."
        actions={
          <>
            <ReserveAccountDialog />
            <ReserveTransactionDialog accounts={reserveAccounts} />
          </>
        }
      />

      <PeriodControls period={period} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-info-subtle text-info">
            <Building2 className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Company reserve ledger</p>
            <p className="text-2xs text-muted-foreground">
              One consolidated balance across every reserve bucket
            </p>
          </div>
        </div>
        <span className="rounded-full border border-info/30 bg-info-subtle px-2.5 py-1 text-2xs font-semibold uppercase tracking-wide text-info">
          Whole fleet · {trucks.filter((truck) => truck.active).length} active trucks
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MiniStat
          label="Company balance"
          value={formatMoneyCompact(total)}
          sub="all reserve buckets"
        />
        <MiniStat
          label="Suggested set-aside"
          value={formatMoneyCompact(ownerPay.reserveTotal)}
          sub={`whole fleet · ${period.shortLabel}`}
          tone="warning"
        />
        <MiniStat
          label="Added"
          value={formatMoneyCompact(periodIn)}
          sub={`company · ${period.shortLabel}`}
          tone="positive"
        />
        <MiniStat
          label="Taken out"
          value={formatMoneyCompact(periodOut)}
          sub={`company · ${period.shortLabel}`}
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
          const recommendation = ownerPay.reserves.find(
            (reserve) => reserve.accountId === balance.account.id,
          );
          const builtIn =
            balance.account.kind === "TAX" || balance.account.kind === "MAINTENANCE";

          return (
            <Card key={balance.account.id} className="min-w-0">
              <CardHeader className="flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Landmark className="size-3.5 text-muted-foreground" />
                    <CardTitle>{balance.account.name}</CardTitle>
                    <span className="rounded-full border border-border bg-surface-sunken px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {balance.account.kind === "MAINTENANCE" ? "Fleet total" : "Company-wide"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-2xs text-muted-foreground">
                    {rule && rule.pct > 0
                      ? `${formatPercent(rule.pct, rule.pct % 1 === 0 ? 0 : 1)} of ${
                          balance.account.basis === "OPERATING_PROFIT"
                            ? "operating profit"
                            : "Booked Revenue"
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
                      <p className="text-warn">
                        {formatMoney(recommendation?.amount ?? 0)} suggested
                      </p>
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
                        {formatMoneyCompact(balance.account.targetBalance)}{" "}
                        {balance.account.kind === "MAINTENANCE" ? "fleet target" : "target"}
                      </p>
                    </div>
                  ) : null}
                </div>

                {balance.account.kind === "MAINTENANCE" && maintenanceByTruck.length > 0 ? (
                  <div className="border-t border-border">
                    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <TruckIcon className="size-3.5 text-info" />
                        <div>
                          <p className="text-xs font-semibold text-foreground">
                            Maintenance by truck
                          </p>
                          <p className="text-2xs text-muted-foreground">
                            Each unit&apos;s share of this period&apos;s fleet recommendation
                          </p>
                        </div>
                      </div>
                      <p className="text-2xs font-medium text-muted-foreground tnum">
                        {formatMoney(recommendation?.amount ?? 0)} fleet total
                      </p>
                    </div>

                    <div className="divide-y divide-border/70 border-t border-border/70">
                      {maintenanceByTruck.map((unit) => (
                        <div
                          key={unit.truckId}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-xs font-semibold text-foreground">
                                {unit.truckName}
                              </p>
                              {!unit.active ? (
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                  inactive
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1.5 flex items-center gap-2">
                              <div className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                                <div
                                  className="h-full rounded-full bg-info"
                                  style={{
                                    width: `${Math.min(100, Math.max(0, unit.revenueSharePct))}%`,
                                  }}
                                />
                              </div>
                              <p className="shrink-0 text-2xs text-muted-foreground tnum">
                                {formatMoney(unit.bookedRevenue)} earned
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                              Set aside
                            </p>
                            <p className="text-sm font-semibold text-warn tnum">
                              {formatMoney(unit.suggestedReserve)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <p className="border-t border-border/70 px-4 py-2.5 text-2xs leading-relaxed text-muted-foreground">
                      Truck rows explain the suggested maintenance amount. The recorded balance and
                      {balance.account.targetBalance
                        ? ` ${formatMoneyCompact(balance.account.targetBalance)} target`
                        : " target"}{" "}
                      remain consolidated for the company.
                    </p>
                  </div>
                ) : null}

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
