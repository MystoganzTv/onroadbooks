"use client";

import { useRouter } from "next/navigation";
import { Check, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";
import * as React from "react";

import { markInvoicePaidAction, voidInvoiceAction } from "@/lib/actions/invoices";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/shell/language-provider";

export function InvoiceActions({ loadId, status, today, canManage }: {
  loadId: string;
  status: "PENDING" | "INVOICED" | "PAID";
  today: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const { dictionary } = useLanguage();
  const copy = dictionary.invoices;
  const [pending, startTransition] = React.useTransition();
  const run = (action: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(localizedClientError(result.error));
        return;
      }
      toast.success(success);
      router.refresh();
    });
  };
  if (!canManage || status === "PENDING") return null;
  return (
    <div className="flex items-center justify-end gap-1">
      {status === "INVOICED" ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => markInvoicePaidAction(loadId, today), copy.paymentRecorded)}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />} {copy.paid}
        </Button>
      ) : null}
      {status !== "PAID" ? (
        <Button size="icon-sm" variant="ghost" title={copy.voidInvoice} disabled={pending} onClick={() => {
          if (window.confirm(copy.voidConfirm)) run(() => voidInvoiceAction(loadId), copy.invoiceVoided);
        }}><Trash2 /></Button>
      ) : null}
    </div>
  );
}
