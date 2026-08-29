import Link from "next/link";
import { Landmark } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney, formatMoneyCompact } from "@/lib/formatters";
import type { ReserveBalance } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Reserve buckets. Planning ledgers, not bank accounts -- said on the card so
 * nobody reads a balance here as money sitting somewhere.
 */
export function ReservesPanel({
  balances,
  periodLabel,
  href = "/reserves",
  className,
}: {
  balances: ReserveBalance[];
  periodLabel: string;
  href?: string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Landmark className="size-3.5 text-muted-foreground" />
          <CardTitle>Reserves</CardTitle>
        </div>
        <Link
          href={href}
          className="text-2xs font-medium text-primary underline-offset-2 hover:underline focus-ring"
        >
          Manage
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border/70">
          {balances.map((balance) => (
            <li key={balance.account.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-xs font-medium text-foreground">
                  {balance.account.name}
                </span>
                <span
                  className={cn(
                    "shrink-0 tnum text-lg font-semibold tracking-tight",
                    balance.balance >= 0 ? "text-foreground" : "text-neg",
                  )}
                >
                  {formatMoneyCompact(balance.balance)}
                </span>
              </div>

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
                  ? `+${formatMoney(balance.periodContributions)} in ${periodLabel}`
                  : `No contribution in ${periodLabel}`}
                {balance.periodWithdrawals > 0
                  ? ` · -${formatMoney(balance.periodWithdrawals)} taken out`
                  : ""}
                {balance.account.targetBalance
                  ? ` · target ${formatMoneyCompact(balance.account.targetBalance)}`
                  : ""}
              </p>
            </li>
          ))}
        </ul>
        <p className="border-t border-border px-4 py-2 text-2xs leading-relaxed text-muted-foreground">
          Planning buckets, not bank accounts. Contributions post when you close a settlement.
        </p>
      </CardContent>
    </Card>
  );
}
