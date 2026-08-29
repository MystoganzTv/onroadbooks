"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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

export function LoadStatusControl({ id, status }: { id: string; status: PaymentStatus }) {
  const router = useRouter();
  const [value, setValue] = React.useState<PaymentStatus>(status);
  const [pending, startTransition] = React.useTransition();

  function change(next: string) {
    const previous = value;
    setValue(next as PaymentStatus);
    startTransition(async () => {
      const result = await updateLoadStatusAction(id, next as PaymentStatus);
      if (result.ok) {
        toast.success(`Marked as ${next.toLowerCase()}`);
        router.refresh();
      } else {
        setValue(previous);
        toast.error(result.error);
      }
    });
  }

  return (
    <Select value={value} onValueChange={change} disabled={pending}>
      <SelectTrigger className="w-[8rem]" aria-label="Payment status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PAYMENT_STATUSES.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
