"use client";

import * as React from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";
import { useLanguage } from "@/components/shell/language-provider";

import {
  addDriverSettlementAdjustmentAction,
  deleteDriverSettlementAdjustmentAction,
} from "@/lib/actions/driver-settlements";
import { DRIVER_ADJUSTMENT_TYPES } from "@/lib/driver-pay";
import { fieldErrors, focusFirstError, validationMessage } from "@/lib/form";
import { driverSettlementAdjustmentSchema } from "@/lib/schemas";
import type { DriverSettlement, DriverSettlementAdjustmentType } from "@/lib/types";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function DriverSettlementAdjustmentDialog({ settlementId }: { settlementId: string }) {
  const { locale, dictionary } = useLanguage();
  const copy = dictionary.driverPay;
  const common = dictionary.common;
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [type, setType] = React.useState<DriverSettlementAdjustmentType>("ACCESSORIAL_PAY");
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const values = { settlementId, type, amount: Number(amount), reason };
    const parsed = driverSettlementAdjustmentSchema.safeParse(values);
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors(next);
      toast.error(validationMessage(next, { type: copy.adjustmentType, amount: copy.amount, reason: copy.reason }));
      requestAnimationFrame(() => focusFirstError("driver-adjustment-form"));
      return;
    }
    startTransition(async () => {
      const result = await addDriverSettlementAdjustmentAction(values);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(localizedClientError(result.error));
        return;
      }
      toast.success(copy.adjustmentAdded, { description: copy.adjustmentAddedDescription });
      setAmount("");
      setReason("");
      setErrors({});
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" size="sm"><Plus /> {copy.addAdjustment}</Button></DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.addAdjustmentTitle}</DialogTitle>
          <DialogDescription>
            {copy.addAdjustmentDescription}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form id="driver-adjustment-form" onSubmit={submit} className="space-y-4" noValidate>
            <Field label={copy.adjustmentType} htmlFor="adjustment-type" required error={errors.type}>
              <Select value={type} onValueChange={(value) => setType(value as DriverSettlementAdjustmentType)}>
                <SelectTrigger id="adjustment-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DRIVER_ADJUSTMENT_TYPES.map((option) => (
                    <SelectItem key={option.id} value={option.id}>{locale === "es" ? option.labelEs : option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={copy.amount} htmlFor="adjustment-amount" required error={errors.amount}>
              <Input id="adjustment-amount" type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" />
            </Field>
            <Field label={copy.reason} htmlFor="adjustment-reason" required error={errors.reason}>
              <Input id="adjustment-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={240} placeholder={copy.reasonPlaceholder} />
            </Field>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>{common.cancel}</Button>
          <Button type="submit" form="driver-adjustment-form" size="sm" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Plus />} {copy.addToDraft}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteDriverSettlementAdjustmentButton({
  settlement,
  adjustmentId,
}: {
  settlement: Pick<DriverSettlement, "id" | "status">;
  adjustmentId: string;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.driverPay;
  const [pending, startTransition] = React.useTransition();
  if (settlement.status !== "DRAFT") return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={pending}
      aria-label={copy.deleteAdjustment}
      onClick={() => startTransition(async () => {
        const result = await deleteDriverSettlementAdjustmentAction(settlement.id, adjustmentId);
        if (!result.ok) toast.error(localizedClientError(result.error));
        else toast.success(copy.adjustmentRemoved);
      })}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  );
}
