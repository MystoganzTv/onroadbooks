"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";

import { deleteDriverSettlementAction, payDriverSettlementAction } from "@/lib/actions/driver-settlements";
import { todayISO } from "@/lib/periods";
import type { DriverSettlement } from "@/lib/types";
import { formatMoney } from "@/lib/formatters";
import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { driverSettlementTotals } from "@/lib/driver-pay";
import { useLanguage } from "@/components/shell/language-provider";
import { interpolate } from "@/lib/i18n/dictionaries";

export function DriverSettlementActions({ settlement, showView = true }: { settlement: DriverSettlement; showView?: boolean }) {
  const router = useRouter();
  const { dictionary } = useLanguage();
  const copy = dictionary.driverPay;
  const common = dictionary.common;
  const [open, setOpen] = React.useState(false);
  const [paidOn, setPaidOn] = React.useState(todayISO());
  const [pending, startTransition] = React.useTransition();
  const total = driverSettlementTotals(settlement);

  function pay() {
    startTransition(async () => {
      const result = await payDriverSettlementAction({ id: settlement.id, paidOn });
      if (!result.ok) {
        toast.error(localizedClientError(result.error));
        return;
      }
      toast.success(copy.statementPaid, {
        description: interpolate(copy.paidLedgerDescription, { amount: formatMoney(total.netPay) }),
      });
      setOpen(false);
      router.refresh();
    });
  }

  async function remove() {
    const result = await deleteDriverSettlementAction(settlement.id);
    if (!result.ok) {
      toast.error(localizedClientError(result.error));
      return;
    }
    toast.success(copy.draftDeleted, { description: copy.draftDeletedDescription });
    router.refresh();
  }

  return (
    <div className="flex justify-end gap-1">
      {showView ? <Button asChild variant="ghost" size="sm"><Link href={`/driver-settlements/${settlement.id}`}><Eye /> {copy.view}</Link></Button> : null}
      {settlement.status === "DRAFT" ? <>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><CreditCard /> {copy.markPaid}</Button></DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{copy.postTitle}</DialogTitle><DialogDescription>
              {interpolate(copy.postDescription, { count: total.loads, unit: total.loads === 1 ? copy.load : copy.loads })}
            </DialogDescription></DialogHeader>
            <DialogBody className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">{copy.netPayToPost}</p><p className="mt-1 text-xl font-semibold tnum">{formatMoney(total.netPay)}</p></div>
              <label className="block text-sm font-medium" htmlFor={`paid-on-${settlement.id}`}>{copy.paymentDate}</label>
              <Input id={`paid-on-${settlement.id}`} type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} />
            </DialogBody>
            <DialogFooter><Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>{common.cancel}</Button><Button size="sm" onClick={pay} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <CreditCard />} {copy.postPayment}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <ConfirmDelete label={`${total.loads} ${total.loads === 1 ? copy.load : copy.loads} · ${formatMoney(total.netPay)}`} entity="draft" consequences={[copy.frozenCalculation]} onConfirm={remove} />
      </> : null}
    </div>
  );
}
