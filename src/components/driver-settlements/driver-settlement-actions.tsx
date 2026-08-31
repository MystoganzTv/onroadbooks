"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { deleteDriverSettlementAction, payDriverSettlementAction } from "@/lib/actions/driver-settlements";
import { todayISO } from "@/lib/periods";
import type { DriverSettlement } from "@/lib/types";
import { formatMoney } from "@/lib/formatters";
import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { driverSettlementTotals } from "@/lib/driver-pay";

export function DriverSettlementActions({ settlement, showView = true }: { settlement: DriverSettlement; showView?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [paidOn, setPaidOn] = React.useState(todayISO());
  const [pending, startTransition] = React.useTransition();
  const total = driverSettlementTotals(settlement);

  function pay() {
    startTransition(async () => {
      const result = await payDriverSettlementAction({ id: settlement.id, paidOn });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Driver statement paid", {
        description: `${formatMoney(total.payAmount)} was posted to the operating ledger as Driver Pay.`,
      });
      setOpen(false);
      router.refresh();
    });
  }

  async function remove() {
    const result = await deleteDriverSettlementAction(settlement.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Draft deleted", { description: "Its loads can now be included in a new statement." });
    router.refresh();
  }

  return (
    <div className="flex justify-end gap-1">
      {showView ? <Button asChild variant="ghost" size="sm"><Link href={`/driver-settlements/${settlement.id}`}><Eye /> View</Link></Button> : null}
      {settlement.status === "DRAFT" ? <>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><CreditCard /> Mark paid</Button></DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Post this driver payment?</DialogTitle><DialogDescription>
              This creates {total.loads} Driver Pay expense{total.loads === 1 ? "" : "s"}, each attached to its original load and truck. Paid statements are permanent.
            </DialogDescription></DialogHeader>
            <DialogBody className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Amount to post</p><p className="mt-1 text-xl font-semibold tnum">{formatMoney(total.payAmount)}</p></div>
              <label className="block text-sm font-medium" htmlFor={`paid-on-${settlement.id}`}>Payment date</label>
              <Input id={`paid-on-${settlement.id}`} type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} />
            </DialogBody>
            <DialogFooter><Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button><Button size="sm" onClick={pay} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <CreditCard />} Post payment</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <ConfirmDelete label={`${total.loads} frozen load${total.loads === 1 ? "" : "s"} · ${formatMoney(total.payAmount)}`} entity="draft" consequences={["the frozen pay calculation (the loads themselves remain untouched)"]} onConfirm={remove} />
      </> : null}
    </div>
  );
}
