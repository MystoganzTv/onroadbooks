"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";
import { useLanguage } from "@/components/shell/language-provider";

import { issueInvoiceAction } from "@/lib/actions/invoices";
import type { Load } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/shared/field";

export function InvoiceDialog({ load, suggestedNumber, today, canManage }: {
  load: Load;
  suggestedNumber: string;
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
    invoiceNumber: load.invoiceNumber ?? suggestedNumber,
    invoiceDate: load.invoiceDate ?? today,
    invoiceDueDate: load.invoiceDueDate ?? null,
    billToName: load.billToName ?? load.broker ?? "",
    billToEmail: load.billToEmail ?? "",
    billToAddress: load.billToAddress ?? "",
    invoiceNotes: load.invoiceNotes ?? "",
  });
  const set = <K extends keyof typeof form>(name: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [name]: value }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await issueInvoiceAction(load.id, form);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(localizedClientError(result.error));
        return;
      }
      toast.success(load.invoiceNumber ? copy.invoiceUpdated : copy.invoiceIssued);
      setOpen(false);
      router.refresh();
      if (!load.invoiceNumber) window.location.assign(`/api/export/invoice/${load.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={!canManage}>
          <FilePlus2 /> {load.invoiceNumber ? copy.editInvoice : copy.issue}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{load.invoiceNumber ? copy.editInvoice : copy.issueInvoice}</DialogTitle>
            <DialogDescription>{load.originCity}, {load.originState} {copy.routeTo} {load.destinationCity}, {load.destinationState}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={copy.invoiceNumber} htmlFor="invoice-number" required error={errors.invoiceNumber}>
                <Input id="invoice-number" value={form.invoiceNumber} onChange={(e) => set("invoiceNumber", e.target.value)} />
              </Field>
              <Field label={copy.customer} htmlFor="invoice-customer" required error={errors.billToName}>
                <Input id="invoice-customer" value={form.billToName} onChange={(e) => set("billToName", e.target.value)} />
              </Field>
              <Field label={copy.invoiceDate} htmlFor="invoice-date" required error={errors.invoiceDate}>
                <Input id="invoice-date" type="date" value={form.invoiceDate} onChange={(e) => set("invoiceDate", e.target.value)} />
              </Field>
              {load.invoiceDueDate ? <Field label={copy.dueDate} htmlFor="invoice-due-date" error={errors.invoiceDueDate}>
                <Input id="invoice-due-date" type="date" value={form.invoiceDueDate ?? ""} onChange={(e) => set("invoiceDueDate", e.target.value || null)} />
              </Field> : null}
            </div>
            <Field label={copy.billingEmail} htmlFor="invoice-email" error={errors.billToEmail}>
              <Input id="invoice-email" type="email" value={form.billToEmail} onChange={(e) => set("billToEmail", e.target.value)} />
            </Field>
            <Field label={copy.billingAddress} htmlFor="invoice-address" error={errors.billToAddress}>
              <Textarea id="invoice-address" rows={3} value={form.billToAddress} onChange={(e) => set("billToAddress", e.target.value)} />
            </Field>
            <Field label={copy.invoiceNotes} htmlFor="invoice-notes" error={errors.invoiceNotes}>
              <Textarea id="invoice-notes" rows={3} value={form.invoiceNotes} onChange={(e) => set("invoiceNotes", e.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{common.cancel}</Button>
            <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : null} {load.invoiceNumber ? copy.saveInvoice : copy.generatePdf}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
