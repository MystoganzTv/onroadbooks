import { WalletCards } from "lucide-react";

import { formatMoneyCompact } from "@/lib/formatters";
import type { CashActivity } from "@/lib/finance/cash-activity";
import { cn } from "@/lib/utils";

export function TodayCashCard({ cash, className }: { cash: CashActivity; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <WalletCards className="size-3.5 text-muted-foreground" />
        <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Today Cash Activity</span>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <Cell label="Cash Collected" value={formatMoneyCompact(cash.collectedRevenue)} />
        <Cell label="Operating Cash Out" value={formatMoneyCompact(cash.operatingCashOutflows)} negative />
        <Cell label="Debt Service" value={formatMoneyCompact(cash.debtService)} negative />
        <Cell label="Net Cash Activity" value={formatMoneyCompact(cash.netCashActivity)} negative={cash.netCashActivity < 0} />
      </div>
    </div>
  );
}

function Cell({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return <div><p className="label-xs">{label}</p><p className={cn("mt-0.5 tnum text-lg font-semibold tracking-tight", negative && "text-neg")}>{value}</p></div>;
}
