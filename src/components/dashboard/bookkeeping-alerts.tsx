"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2, Repeat2 } from "lucide-react";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";

import { addMonthlyExpensesAction } from "@/lib/actions/bookkeeping";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/shell/language-provider";
import { interpolate } from "@/lib/i18n/dictionaries";

interface BookkeepingAlertsProps {
  /** Fixed costs whose date has passed and that are still not in the books. */
  dueCount: number;
  dueTotal: number;
  /** Fixed costs dated later this month. Not late -- just not yet. */
  scheduledCount: number;
  scheduledTotal: number;
  month: string;
  monthLabel: string;
  truckId: string | null;
}

/**
 * The monthly fixed costs the books are still missing.
 *
 * The nightly job posts each cost on its own date, so in the normal month
 * there is nothing here at all. What is left is one of two things, and they
 * do not deserve the same colour: something DUE and still missing (the job
 * has not run yet, or this is a past month it will never touch) is a real gap
 * and keeps the warning treatment and the button; something dated later this
 * month is simply scheduled, and is shown as a quiet note so the owner knows
 * the cost is coming without being told to act on it.
 */
export function BookkeepingAlerts({
  dueCount,
  dueTotal,
  scheduledCount,
  scheduledTotal,
  month,
  monthLabel,
  truckId,
}: BookkeepingAlertsProps) {
  const router = useRouter();
  const { dictionary } = useLanguage();
  const copy = dictionary.dashboard;
  const [pending, startTransition] = React.useTransition();

  if (dueCount === 0 && scheduledCount === 0) return null;

  const actionable = dueCount > 0;

  function run() {
    startTransition(async () => {
      const result = await addMonthlyExpensesAction(month, truckId);
      if (result.ok) {
        toast.success(copy.monthlyAdded);
        router.refresh();
      } else {
        toast.error(localizedClientError(result.error));
      }
    });
  }

  if (!actionable) {
    return (
      <section className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-2.5">
        <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
        <p className="text-2xs text-muted-foreground">
          {interpolate(copy.scheduledCosts, { amount: formatMoney(scheduledTotal), month: monthLabel })}
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-warn/30 bg-warn-soft/40">
      <div className="border-b border-warn/20 px-4 py-2.5">
        <p className="text-xs font-semibold text-foreground">{copy.bookkeepingCheck}</p>
        <p className="mt-0.5 text-2xs text-muted-foreground">
          {copy.bookkeepingDescription}
        </p>
      </div>
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <Repeat2 className="mt-0.5 size-4 shrink-0 text-warn" />
          <div>
            <p className="text-sm font-medium">
              {interpolate(copy.monthlyMissing, { count: dueCount, unit: dueCount === 1 ? copy.expense : copy.expenses, month: monthLabel })}
            </p>
            <p className={cn("mt-0.5 text-2xs text-muted-foreground")}>
              {interpolate(copy.addMonthly, { amount: formatMoney(dueTotal) })}
              {scheduledCount > 0 ? interpolate(copy.scheduledMore, { amount: formatMoney(scheduledTotal) }) : ""}
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={run} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {copy.addNow}
        </Button>
      </div>
    </section>
  );
}
