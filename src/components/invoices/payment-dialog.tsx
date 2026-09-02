"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Banknote, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";

import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { recordInvoicePaymentAction } from "@/lib/actions/invoices";
import { formatMoney } from "@/lib/formatters";
import { useLanguage } from "@/components/shell/language-provider";
import { interpolate } from "@/lib/i18n/dictionaries";

export function PaymentDialog({
  loadId,
  balance,
  today,
  canManage,
}: {
  loadId: string;
  balance: number;
  today: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const { dictionary } = useLanguage();
  const copy = dictionary.invoices;
  const common = dictionary.common;
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [form, setForm] = React.useState({
    date: today,
    amount: String(balance),
    method: "",
    reference: "",
    notes: "",
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await recordInvoicePaymentAction({
        loadId,
        date: form.date,
        amount: Number(form.amount),
        method: form.method || null,
        reference: form.reference || null,
        notes: form.notes || null,
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(localizedClientError(result.error));
        return;
      }
      toast.success(copy.paymentRecorded);
      setOpen(false);
      router.refresh();
    });
  }

  if (!canManage || balance <= 0) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Banknote /> {copy.recordPayment}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{copy.recordCustomerPayment}</DialogTitle>
            <DialogDescription>
              {interpolate(copy.remainingBalance, { amount: formatMoney(balance) })}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4 sm:grid-cols-2">
            <Field label={copy.paymentDate} htmlFor={`payment-date-${loadId}`} required error={errors.date}>
              <Input id={`payment-date-${loadId}`} type="date" value={form.date} onChange={(event) => setForm((value) => ({ ...value, date: event.target.value }))} />
            </Field>
            <Field label={copy.amount} htmlFor={`payment-amount-${loadId}`} required error={errors.amount}>
              <Input id={`payment-amount-${loadId}`} inputMode="decimal" value={form.amount} onChange={(event) => setForm((value) => ({ ...value, amount: event.target.value }))} />
            </Field>
            <Field label={copy.method} htmlFor={`payment-method-${loadId}`}>
              <Input id={`payment-method-${loadId}`} placeholder={copy.methodPlaceholder} value={form.method} onChange={(event) => setForm((value) => ({ ...value, method: event.target.value }))} />
            </Field>
            <Field label={copy.reference} htmlFor={`payment-reference-${loadId}`}>
              <Input id={`payment-reference-${loadId}`} value={form.reference} onChange={(event) => setForm((value) => ({ ...value, reference: event.target.value }))} />
            </Field>
            <Field label={copy.notes} htmlFor={`payment-notes-${loadId}`} className="sm:col-span-2">
              <Textarea id={`payment-notes-${loadId}`} rows={3} value={form.notes} onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{common.cancel}</Button>
            <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null} {copy.savePayment}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
