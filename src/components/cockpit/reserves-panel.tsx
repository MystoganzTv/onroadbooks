"use client";

import Link from "next/link";
import { Landmark } from "lucide-react";

import { useLanguage } from "@/components/shell/language-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney, formatMoneyCompact } from "@/lib/formatters";
import type { ReserveLine } from "@/lib/finance/owner-pay";
import type { ReserveBalance } from "@/lib/types";
import { interpolate } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

/**
 * Reserve buckets. Planning ledgers, not bank accounts -- said on the card so
 * nobody reads a balance here as money sitting somewhere.
 */
export function ReservesPanel({
  balances,
  planned,
  periodLabel,
  href = "/reserves",
  className,
}: {
  balances: ReserveBalance[];
  planned: ReserveLine[];
  periodLabel: string;
  href?: string;
  className?: string;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.dashboard;
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Landmark className="size-3.5 text-muted-foreground" />
          <CardTitle>{copy.reserves}</CardTitle>
        </div>
        <Link
          href={href}
          className="text-2xs font-medium text-primary underline-offset-2 hover:underline focus-ring"
        >
          {copy.manage}
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border/70">
          {balances.map((balance) => {
            const recommendation = planned.find((line) => line.accountId === balance.account.id);
            return (
              <li key={balance.account.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-xs font-medium text-foreground">
                    {balance.account.name}
                  </span>
                  <span className="shrink-0 tnum text-lg font-semibold tracking-tight text-warn">
                    {formatMoneyCompact(recommendation?.amount ?? 0)}
                  </span>
                </div>

                <p className="mt-0.5 text-2xs text-muted-foreground tnum">
                  {interpolate(copy.setAsideFor, {
                    period: periodLabel,
                    balance: formatMoneyCompact(balance.balance),
                  })}
                </p>

                {balance.targetProgress !== null ? (
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        balance.targetProgress >= 100 ? "bg-pos" : "bg-info",
                      )}
                      style={{ width: `${Math.min(100, Math.max(0, balance.targetProgress))}%` }}
                    />
                  </div>
                ) : null}

                <p className="mt-1 text-2xs text-muted-foreground tnum">
                  {balance.periodContributions > 0
                    ? interpolate(copy.contributedIn, {
                        amount: formatMoney(balance.periodContributions),
                        period: periodLabel,
                      })
                    : interpolate(copy.noContributionIn, { period: periodLabel })}
                  {balance.periodWithdrawals > 0
                    ? ` · -${interpolate(copy.takenOut, { amount: formatMoney(balance.periodWithdrawals) })}`
                    : ""}
                  {balance.account.targetBalance
                    ? ` · ${interpolate(copy.targetAmount, { amount: formatMoneyCompact(balance.account.targetBalance) })}`
                    : ""}
                </p>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-border px-4 py-2 text-2xs leading-relaxed text-muted-foreground">
          {copy.reserveExplanation}
        </p>
      </CardContent>
    </Card>
  );
}
