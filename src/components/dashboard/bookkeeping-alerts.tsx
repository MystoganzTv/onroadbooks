"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2, Repeat2 } from "lucide-react";
import { toast } from "sonner";

import { addMonthlyExpensesAction } from "@/lib/actions/bookkeeping";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/formatters";
import { cn } from "@/lib/utils";

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
  const [pending, startTransition] = React.useTransition();

  if (dueCount === 0 && scheduledCount === 0) return null;

  const actionable = dueCount > 0;

  function run() {
    startTransition(async () => {
      const result = await addMonthlyExpensesAction(month, truckId);
      if (result.ok) {
        toast.success("Monthly expenses added");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  if (!actionable) {
    return (
      <section className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-2.5">
        <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
        <p className="text-2xs text-muted-foreground">
          {formatMoney(scheduledTotal)} of fixed costs
          {scheduledCount === 1 ? " is" : " are"} scheduled later in {monthLabel} —{" "}
          {scheduledCount === 1 ? "it posts" : "they post"} automatically on{" "}
          {scheduledCount === 1 ? "its date" : "their dates"}.
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-warn/30 bg-warn-soft/40">
      <div className="border-b border-warn/20 px-4 py-2.5">
        <p className="text-xs font-semibold text-foreground">Bookkeeping check</p>
        <p className="mt-0.5 text-2xs text-muted-foreground">
          Complete these items so Operating Profit and Actual Cost / Mile use all known costs.
        </p>
      </div>
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <Repeat2 className="mt-0.5 size-4 shrink-0 text-warn" />
          <div>
            <p className="text-sm font-medium">
              {dueCount} monthly expense{dueCount === 1 ? " is" : "s are"} missing for{" "}
              {monthLabel}
            </p>
            <p className={cn("mt-0.5 text-2xs text-muted-foreground")}>
              Add {formatMoney(dueTotal)} from truck payment, insurance or recurring templates.
              {scheduledCount > 0
                ? ` ${formatMoney(scheduledTotal)} more is dated later this month and posts on its own.`
                : ""}
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={run} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Add them now
        </Button>
      </div>
    </section>
  );
}
