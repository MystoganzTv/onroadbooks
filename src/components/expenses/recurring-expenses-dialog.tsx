"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Repeat } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/components/shell/language-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { stopRecurringExpenseAction } from "@/lib/actions/expenses";
import { localizedClientError } from "@/lib/i18n/errors";
import { formatMoney } from "@/lib/formatters";
import { formatLocaleDate } from "@/lib/i18n-format";
import type { ActiveRecurringExpense } from "@/lib/recurring-expenses";
import type { Truck } from "@/lib/types";

export function RecurringExpensesDialog({ schedules, trucks, canManage }: { schedules: ActiveRecurringExpense[]; trucks: Truck[]; canManage: boolean }) {
  const { dictionary, locale } = useLanguage();
  const copy = dictionary.expenses;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function stop(id: string) {
    startTransition(async () => {
      const result = await stopRecurringExpenseAction(id);
      if (!result.ok) return void toast.error(localizedClientError(result.error));
      toast.success(copy.recurringStopped);
      router.refresh();
    });
  }
  return <Dialog>
    <DialogTrigger asChild><Button variant="outline" size="sm"><Repeat />{copy.recurringSchedules}{schedules.length > 0 ? ` (${schedules.length})` : ""}</Button></DialogTrigger>
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>{copy.recurringSchedules}</DialogTitle><DialogDescription>{copy.recurringSchedulesHint}</DialogDescription></DialogHeader>
      <DialogBody>
        {schedules.length === 0 ? <p className="py-4 text-sm text-muted-foreground">{copy.noRecurringSchedules}</p> : <ul className="divide-y divide-border">
          {schedules.map((schedule) => <li key={schedule.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="min-w-0 flex-1 basis-48">
              <p className="break-words text-sm font-medium">{schedule.description}</p>
              <p className="mt-1 text-sm tnum">{formatMoney(schedule.amount)} · {copy.monthly}</p>
              <p className="mt-1 text-xs text-muted-foreground">{copy.nextOccurrence}: {formatLocaleDate(schedule.nextDate, locale)}</p>
              {trucks.length > 1 ? <p className="text-xs text-muted-foreground">{trucks.find((truck) => truck.id === schedule.truckId)?.name ?? copy.business}</p> : null}
            </div>
            {canManage ? <Button size="sm" variant="outline" disabled={pending} onClick={() => stop(schedule.id)}>{pending ? <Loader2 className="animate-spin" /> : null}{copy.stopRecurring}</Button> : null}
          </li>)}
        </ul>}
      </DialogBody>
    </DialogContent>
  </Dialog>;
}
