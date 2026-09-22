"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/components/shell/language-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/shared/field";
import { classifyDebtPaymentAction } from "@/lib/actions/expenses";
import { localizedClientError } from "@/lib/i18n/errors";
import { formatMoney } from "@/lib/formatters";
import { formatLocaleDate } from "@/lib/i18n-format";
import type { Expense, FinancialObligation, Truck } from "@/lib/types";

export function UnlinkedLoanPayments({ payments, obligations, trucks, canManage }: {
  payments: Expense[];
  obligations: FinancialObligation[];
  trucks: Truck[];
  canManage: boolean;
}) {
  const { dictionary, locale } = useLanguage();
  const copy = dictionary.financing;
  if (payments.length === 0) return null;
  return (
    <Card>
      <CardHeader><div>
        <CardTitle>{copy.unlinkedPayments}</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">{copy.unlinkedPaymentsHint}</p>
      </div></CardHeader>
      <CardContent className="divide-y divide-border p-0">
        {payments.map((payment) => <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-sm font-medium">{payment.description}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatLocaleDate(payment.date, locale)} · {payment.vendor || trucks.find((truck) => truck.id === payment.truckId)?.name || copy.businessWide}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tnum">{formatMoney(payment.amount)}</span>
            {canManage ? <LinkLoanPayment payment={payment} obligations={obligations} /> : null}
          </div>
        </div>)}
      </CardContent>
    </Card>
  );
}

function LinkLoanPayment({ payment, obligations }: { payment: Expense; obligations: FinancialObligation[] }) {
  const { dictionary, locale } = useLanguage();
  const copy = dictionary.financing;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [obligationId, setObligationId] = useState("");
  const [pending, startTransition] = useTransition();
  const options = obligations.filter((obligation) => obligation.kind === "LOAN" && (!obligation.truckId || obligation.truckId === payment.truckId));
  const selected = options.find((obligation) => obligation.id === obligationId);
  const beforeStart = Boolean(selected?.startedOn && payment.date < selected.startedOn);

  function save() {
    if (!selected) return;
    startTransition(async () => {
      const result = await classifyDebtPaymentAction(payment.id, {
        treatment: "DEBT_UNALLOCATED",
        obligationId: selected.id,
      });
      if (!result.ok) { toast.error(localizedClientError(result.error)); return; }
      toast.success(copy.paymentLinked);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) setObligationId(""); }}>
      <DialogTrigger asChild><Button size="sm" variant="outline">{copy.linkPayment}</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.linkPayment}</DialogTitle>
          <DialogDescription>{copy.linkPaymentHint}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-sm">{payment.description} · {formatLocaleDate(payment.date, locale)} · {formatMoney(payment.amount)}</p>
          <Field label={dictionary.expenses.obligation} htmlFor={`link-loan-${payment.id}`}>
            <Select value={obligationId} onValueChange={setObligationId}>
              <SelectTrigger id={`link-loan-${payment.id}`}><SelectValue placeholder={copy.chooseLoan} /></SelectTrigger>
              <SelectContent>{options.map((obligation) => <SelectItem key={obligation.id} value={obligation.id}>{obligation.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          {options.length === 0 ? <p className="text-xs text-muted-foreground">{copy.noLoanToLink}</p> : null}
          {beforeStart ? <p className="text-xs text-warn" role="status">{copy.paymentBeforeStart}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{dictionary.common.cancel}</Button>
          <Button onClick={save} disabled={!selected || pending}>{pending ? <Loader2 className="animate-spin" /> : null}{copy.linkPayment}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
