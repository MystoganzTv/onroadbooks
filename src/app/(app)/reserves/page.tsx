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
import { formatMoney, formatMoneyCompact, formatPercent } from "@/lib/formatters";
import { formatLocaleDate, formatLocalePeriod } from "@/lib/i18n-format";
import { getWebDictionary, interpolate } from "@/lib/i18n/dictionaries";
import { getAppLocale } from "@/lib/i18n-server";
import { periodFromSearchParams, type SearchParams } from "@/lib/period-params";
import { planAllows } from "@/lib/plans";
import { roleCan } from "@/lib/roles";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).reserves.metadataTitle };
}

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
  const [params, session, locale] = await Promise.all([
    searchParams,
    requireSession(),
    getAppLocale(),
  ]);
  const copy = getWebDictionary(locale).reserves;
  if (!roleCan(session.role ?? "VIEWER", "manage_owner_finances")) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <PageHeader title={copy.metadataTitle} description={copy.ownerWorkspace} />
        <Card className="mx-auto max-w-2xl">
          <CardContent className="p-6 text-sm leading-relaxed text-muted-foreground">
            {copy.ownerOnly}
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
          title={copy.metadataTitle}
          description={copy.gateDescription}
        />
        <PlanGate
          capability="cockpit"
          what={copy.gateWhat}
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
  const periodLabel = formatLocalePeriod(period, locale, "short");
  const activeTruckCount = trucks.filter((truck) => truck.active).length;
  const reserveName = (kind: (typeof reserveAccounts)[number]["kind"], name: string) =>
    kind === "TAX" ? copy.taxReserve : kind === "MAINTENANCE" ? copy.maintenanceReserve : name;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
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
            <p className="text-sm font-semibold text-foreground">{copy.companyLedger}</p>
            <p className="text-2xs text-muted-foreground">
              {copy.consolidatedBalance}
            </p>
          </div>
        </div>
        <span className="rounded-full border border-info/30 bg-info-subtle px-2.5 py-1 text-2xs font-semibold uppercase tracking-wide text-info">
          {interpolate(copy.wholeFleetActive, {
            count: activeTruckCount,
            unit: activeTruckCount === 1 ? copy.truck : copy.trucks,
          })}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MiniStat
          label={copy.companyBalance}
          value={formatMoneyCompact(total)}
          sub={copy.allBuckets}
        />
        <MiniStat
          label={copy.suggestedSetAside}
          value={formatMoneyCompact(ownerPay.reserveTotal)}
          sub={interpolate(copy.wholeFleetPeriod, { period: periodLabel })}
          tone="warning"
        />
        <MiniStat
          label={copy.added}
          value={formatMoneyCompact(periodIn)}
          sub={interpolate(copy.companyPeriod, { period: periodLabel })}
          tone="positive"
        />
        <MiniStat
          label={copy.takenOut}
          value={formatMoneyCompact(periodOut)}
          sub={interpolate(copy.companyPeriod, { period: periodLabel })}
          tone="warning"
        />
        <MiniStat
          label={copy.buckets}
          value={String(balances.filter((b) => b.account.active).length)}
          sub={getWebDictionary(locale).common.active.toLowerCase()}
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
                    <CardTitle>{reserveName(balance.account.kind, balance.account.name)}</CardTitle>
                    <span className="rounded-full border border-border bg-surface-sunken px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {balance.account.kind === "MAINTENANCE" ? copy.fleetTotal : copy.companyWide}
                    </span>
                  </div>
                  <p className="mt-0.5 text-2xs text-muted-foreground">
                    {rule && rule.pct > 0
                      ? interpolate(copy.automaticRule, {
                          percent: formatPercent(rule.pct, rule.pct % 1 === 0 ? 0 : 1),
                          basis:
                            balance.account.basis === "OPERATING_PROFIT"
                              ? copy.operatingProfit
                              : copy.bookedRevenue,
                        })
                      : copy.noAutomaticContribution}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <ReserveAccountDialog account={balance.account} />
                  {!builtIn ? (
                    <DeleteReserveAccountButton
                      id={balance.account.id}
                      name={reserveName(balance.account.kind, balance.account.name)}
                    />
                  ) : null}
                </div>
              </CardHeader>

              <CardContent className="p-0">
                <div className="px-4 py-3.5">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="label-xs">{copy.currentBalance}</p>
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
                        {interpolate(copy.suggested, {
                          amount: formatMoney(recommendation?.amount ?? 0),
                        })}
                      </p>
                      <p className="text-pos">
                        {interpolate(copy.moneyIn, { amount: formatMoney(balance.contributions) })}
                      </p>
                      <p className="text-warn">
                        {interpolate(copy.moneyOut, { amount: formatMoney(balance.withdrawals) })}
                      </p>
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
                        {interpolate(copy.targetProgress, {
                          percent: Math.round(balance.targetProgress ?? 0),
                          amount: formatMoneyCompact(balance.account.targetBalance),
                          target:
                            balance.account.kind === "MAINTENANCE"
                              ? copy.fleetTarget
                              : copy.target,
                        })}
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
                            {copy.maintenanceByTruck}
                          </p>
                          <p className="text-2xs text-muted-foreground">
                            {copy.maintenanceShare}
                          </p>
                        </div>
                      </div>
                      <p className="text-2xs font-medium text-muted-foreground tnum">
                        {interpolate(copy.amountFleetTotal, {
                          amount: formatMoney(recommendation?.amount ?? 0),
                        })}
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
                                  {copy.inactive}
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
                                {interpolate(copy.amountEarned, {
                                  amount: formatMoney(unit.bookedRevenue),
                                })}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                              {copy.setAside}
                            </p>
                            <p className="text-sm font-semibold text-warn tnum">
                              {formatMoney(unit.suggestedReserve)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <p className="border-t border-border/70 px-4 py-2.5 text-2xs leading-relaxed text-muted-foreground">
                      {interpolate(copy.consolidatedTarget, {
                        target: balance.account.targetBalance
                          ? formatMoneyCompact(balance.account.targetBalance)
                          : copy.target,
                      })}
                    </p>
                  </div>
                ) : null}

                <div className="border-t border-border">
                  <div className="flex items-center justify-between gap-2 px-4 py-2">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {copy.movements}
                    </p>
                    <ReserveTransactionDialog
                      accounts={reserveAccounts}
                      defaultAccountId={balance.account.id}
                      trigger={
                        <button
                          type="button"
                          className="text-2xs font-medium text-primary underline-offset-2 hover:underline focus-ring"
                        >
                          {copy.add}
                        </button>
                      }
                    />
                  </div>

                  {balance.transactions.length === 0 ? (
                    <p className="px-4 pb-3 text-2xs text-muted-foreground">
                      {copy.noMovements}
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
                              {formatLocaleDate(txn.date, locale, {
                                month: "short",
                                day: "numeric",
                              })}
                              {txn.settlementId ? ` · ${copy.fromClosedSettlement}` : ""}
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
        {copy.ledgerExplanation}
      </p>
    </div>
  );
}
