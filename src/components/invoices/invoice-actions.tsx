"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";
import * as React from "react";

import { voidInvoiceAction } from "@/lib/actions/invoices";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/shell/language-provider";

export function InvoiceActions({ loadId, canVoid, canManage }: {
  loadId: string;
  canVoid: boolean;
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
  if (!canManage || !canVoid) return null;
  return (
    <Button size="icon-sm" variant="ghost" title={copy.voidInvoice} disabled={pending} onClick={() => {
      if (window.confirm(copy.voidConfirm)) run(() => voidInvoiceAction(loadId), copy.invoiceVoided);
    }}><Trash2 /></Button>
  );
}
