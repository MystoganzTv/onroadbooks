"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";
import { useLanguage } from "@/components/shell/language-provider";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateLoadStatusAction } from "@/lib/actions/loads";
import { PAYMENT_STATUSES } from "@/lib/categories";
import type { PaymentStatus } from "@/lib/types";
import { interpolate } from "@/lib/i18n/dictionaries";

export function LoadStatusControl({ id, status }: { id: string; status: PaymentStatus }) {
  const { dictionary, locale } = useLanguage();
  const copy = dictionary.loads;
  const router = useRouter();
  const [value, setValue] = React.useState<PaymentStatus>(status);
  const [pending, startTransition] = React.useTransition();

  function change(next: string) {
    const previous = value;
    setValue(next as PaymentStatus);
    startTransition(async () => {
      const result = await updateLoadStatusAction(id, next as PaymentStatus);
      if (result.ok) {
        const label = next === "PAID" ? copy.paid : next === "INVOICED" ? copy.invoiced : copy.pending;
        toast.success(interpolate(copy.markedAs, { status: label.toLocaleLowerCase(locale) }));
        router.refresh();
      } else {
        setValue(previous);
        toast.error(localizedClientError(result.error));
      }
    });
  }

  return (
    <Select value={value} onValueChange={change} disabled={pending}>
      <SelectTrigger className="w-[8rem]" aria-label={copy.paymentStatusAria}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PAYMENT_STATUSES.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.id === "PAID" ? copy.paid : option.id === "INVOICED" ? copy.invoiced : copy.pending}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
