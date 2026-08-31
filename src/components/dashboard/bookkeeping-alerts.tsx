"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Repeat2 } from "lucide-react";
import { toast } from "sonner";

import { addMonthlyExpensesAction } from "@/lib/actions/bookkeeping";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/formatters";

interface BookkeepingAlertsProps {
  monthlyCount: number;
  monthlyTotal: number;
  month: string;
  monthLabel: string;
  truckId: string | null;
}

export function BookkeepingAlerts({
  monthlyCount,
  monthlyTotal,
  month,
  monthLabel,
  truckId,
}: BookkeepingAlertsProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  if (monthlyCount === 0) return null;

  function run() {
    startTransition(async () => {
      const result = await addMonthlyExpensesAction(month, truckId);
      if (result.ok) {
        toast.success("Monthly expenses synchronized");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <section className="overflow-hidden rounded-lg border border-warn/30 bg-warn-soft/40">
      <div className="border-b border-warn/20 px-4 py-2.5">
        <p className="text-xs font-semibold text-foreground">Bookkeeping check</p>
        <p className="mt-0.5 text-2xs text-muted-foreground">
          Complete these items so Net Profit and True Cost / Mile use all known costs.
        </p>
      </div>
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <Repeat2 className="mt-0.5 size-4 shrink-0 text-warn" />
          <div>
            <p className="text-sm font-medium">
              {monthlyCount} monthly expense{monthlyCount === 1 ? " needs" : "s need"}{" "}
              attention for {monthLabel}
            </p>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              Sync {formatMoney(monthlyTotal)} from truck payment, insurance or recurring templates.
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={run} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Sync monthly expenses
        </Button>
      </div>
    </section>
  );
}
