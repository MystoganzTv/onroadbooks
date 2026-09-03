"use client";

import * as React from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { useLanguage } from "@/components/shell/language-provider";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  createFinancialObligationAction,
  updateFinancialObligationAction,
} from "@/lib/actions/financing";
import { fieldErrors, focusFirstError, validationMessage } from "@/lib/form";
import { localizedClientError } from "@/lib/i18n/errors";
import { financialObligationSchema } from "@/lib/schemas";
import type { FinancialObligation, FinancialObligationKind, Truck } from "@/lib/types";
import { toNumber } from "@/lib/utils";

export function FinancialObligationDialog({
  obligation,
  trucks,
  kindLocked = false,
  trigger,
}: {
  obligation?: FinancialObligation;
  trucks: Truck[];
  kindLocked?: boolean;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const { dictionary } = useLanguage();
  const copy = dictionary.financing;
  const common = dictionary.common;
  const formId = `financial-obligation-${obligation?.id ?? "new"}`;
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [name, setName] = React.useState(obligation?.name ?? "");
  const [kind, setKind] = React.useState<FinancialObligationKind>(obligation?.kind ?? "LOAN");
  const [counterparty, setCounterparty] = React.useState(obligation?.counterparty ?? "");
  const [startingBalance, setStartingBalance] = React.useState(
    obligation?.startingBalance != null ? String(obligation.startingBalance) : "",
  );
  const [aprPercent, setAprPercent] = React.useState(
    obligation?.aprPercent != null ? String(obligation.aprPercent) : "",
  );
  const [paymentDueDay, setPaymentDueDay] = React.useState(
    obligation?.paymentDueDay != null ? String(obligation.paymentDueDay) : "",
  );
  const [monthlyPayment, setMonthlyPayment] = React.useState(
    obligation?.expectedMonthlyPayment != null ? String(obligation.expectedMonthlyPayment) : "",
  );
  const [truckId, setTruckId] = React.useState(obligation?.truckId ?? "none");
  const [startedOn, setStartedOn] = React.useState(obligation?.startedOn ?? "");
  const [endedOn, setEndedOn] = React.useState(obligation?.endedOn ?? "");
  const [active, setActive] = React.useState(obligation?.active ?? true);

  React.useEffect(() => {
    if (!open) return;
    setName(obligation?.name ?? "");
    setKind(obligation?.kind ?? "LOAN");
    setCounterparty(obligation?.counterparty ?? "");
    setStartingBalance(
      obligation?.startingBalance != null ? String(obligation.startingBalance) : "",
    );
    setAprPercent(obligation?.aprPercent != null ? String(obligation.aprPercent) : "");
    setPaymentDueDay(
      obligation?.paymentDueDay != null ? String(obligation.paymentDueDay) : "",
    );
    setMonthlyPayment(
      obligation?.expectedMonthlyPayment != null ? String(obligation.expectedMonthlyPayment) : "",
    );
    setTruckId(obligation?.truckId ?? "none");
    setStartedOn(obligation?.startedOn ?? "");
    setEndedOn(obligation?.endedOn ?? "");
    setActive(obligation?.active ?? true);
    setErrors({});
  }, [open, obligation]);

  const fieldLabels: Record<string, string> = {
    name: copy.name,
    kind: copy.type,
    counterparty: copy.lender,
    startingBalance: copy.startingBalance,
    aprPercent: copy.apr,
    paymentDueDay: copy.paymentDueDay,
    expectedMonthlyPayment: copy.expectedMonthlyPayment,
    truckId: copy.associatedTruck,
    startedOn: copy.startedOn,
    endedOn: copy.endedOn,
  };

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      name,
      kind,
      counterparty: counterparty.trim() || null,
      startingBalance:
        kind === "LOAN" && startingBalance !== "" ? toNumber(startingBalance) : null,
      aprPercent: kind === "LOAN" && aprPercent !== "" ? toNumber(aprPercent) : null,
      paymentDueDay: paymentDueDay === "" ? null : toNumber(paymentDueDay),
      expectedMonthlyPayment: monthlyPayment === "" ? null : toNumber(monthlyPayment),
      truckId: truckId === "none" ? null : truckId,
      startedOn: startedOn || null,
      endedOn: endedOn || null,
      active,
    };
    const parsed = financialObligationSchema.safeParse(payload);
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors(next);
      toast.error(validationMessage(next, fieldLabels));
      requestAnimationFrame(() => focusFirstError(formId));
      return;
    }

    setErrors({});
    startTransition(async () => {
      const result = obligation
        ? await updateFinancialObligationAction(obligation.id, payload)
        : await createFinancialObligationAction(payload);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(localizedClientError(result.error));
        return;
      }
      toast.success(obligation ? copy.updated : copy.created);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus />
            {copy.addObligation}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <form id={formId} onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{obligation ? copy.editObligation : copy.addObligation}</DialogTitle>
            <DialogDescription>{copy.formDescription}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={copy.name} htmlFor={`${formId}-name`} required error={errors.name}>
                <Input
                  id={`${formId}-name`}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={120}
                  placeholder={copy.namePlaceholder}
                  required
                />
              </Field>
              <Field
                label={copy.type}
                htmlFor={`${formId}-kind`}
                required
                error={errors.kind}
                hint={kindLocked ? copy.typeLocked : undefined}
              >
                <Select
                  value={kind}
                  onValueChange={(value) => setKind(value as FinancialObligationKind)}
                  disabled={kindLocked}
                >
                  <SelectTrigger id={`${formId}-kind`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOAN">{copy.loan}</SelectItem>
                    <SelectItem value="OPERATING_LEASE">{copy.operatingLease}</SelectItem>
                    <SelectItem value="UNKNOWN">{copy.unknown}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={copy.lender} htmlFor={`${formId}-lender`} error={errors.counterparty}>
                <Input
                  id={`${formId}-lender`}
                  value={counterparty}
                  onChange={(event) => setCounterparty(event.target.value)}
                  maxLength={120}
                  placeholder={copy.optional}
                />
              </Field>
              <Field
                label={copy.expectedMonthlyPayment}
                htmlFor={`${formId}-monthly`}
                error={errors.expectedMonthlyPayment}
              >
                <Input
                  id={`${formId}-monthly`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={monthlyPayment}
                  onChange={(event) => setMonthlyPayment(event.target.value)}
                  placeholder="513"
                />
              </Field>
            </div>
            {kind === "LOAN" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={copy.startingBalance}
                  htmlFor={`${formId}-starting-balance`}
                  error={errors.startingBalance}
                  hint={copy.startingBalanceHint}
                >
                  <Input
                    id={`${formId}-starting-balance`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={startingBalance}
                    onChange={(event) => setStartingBalance(event.target.value)}
                    placeholder="25000"
                  />
                </Field>
                <Field
                  label={copy.apr}
                  htmlFor={`${formId}-apr`}
                  error={errors.aprPercent}
                  hint={copy.aprHint}
                >
                  <Input
                    id={`${formId}-apr`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="100"
                    step="0.01"
                    value={aprPercent}
                    onChange={(event) => setAprPercent(event.target.value)}
                    placeholder="8.25"
                  />
                </Field>
              </div>
            ) : null}
            <Field label={copy.associatedTruck} htmlFor={`${formId}-truck`} error={errors.truckId}>
              <Select value={truckId} onValueChange={setTruckId}>
                <SelectTrigger id={`${formId}-truck`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{copy.noTruck}</SelectItem>
                  {trucks.map((truck) => (
                    <SelectItem key={truck.id} value={truck.id}>
                      {truck.name}{truck.active ? "" : ` · ${copy.retired}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label={copy.paymentDueDay}
                htmlFor={`${formId}-due-day`}
                error={errors.paymentDueDay}
                hint={copy.paymentDueDayHint}
              >
                <Input
                  id={`${formId}-due-day`}
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="31"
                  step="1"
                  value={paymentDueDay}
                  onChange={(event) => setPaymentDueDay(event.target.value)}
                  placeholder="15"
                />
              </Field>
              <Field label={copy.startedOn} htmlFor={`${formId}-start`} error={errors.startedOn}>
                <Input
                  id={`${formId}-start`}
                  type="date"
                  value={startedOn}
                  onChange={(event) => setStartedOn(event.target.value)}
                />
              </Field>
              <Field label={copy.endedOn} htmlFor={`${formId}-end`} error={errors.endedOn}>
                <Input
                  id={`${formId}-end`}
                  type="date"
                  value={endedOn}
                  onChange={(event) => setEndedOn(event.target.value)}
                />
              </Field>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-surface-sunken px-3 py-2">
              <div>
                <Label htmlFor={`${formId}-active`} className="normal-case tracking-normal text-foreground">
                  {copy.activeFinancing}
                </Label>
                <p className="mt-0.5 text-2xs text-muted-foreground">{copy.activeHint}</p>
              </div>
              <Switch
                id={`${formId}-active`}
                checked={active}
                onCheckedChange={(checked) => {
                  setActive(checked);
                  if (checked) setEndedOn("");
                }}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {common.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {obligation ? copy.saveChanges : copy.createObligation}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditFinancialObligationButton({
  obligation,
  trucks,
  kindLocked = false,
}: {
  obligation: FinancialObligation;
  trucks: Truck[];
  kindLocked?: boolean;
}) {
  const { dictionary } = useLanguage();
  return (
    <FinancialObligationDialog
      obligation={obligation}
      trucks={trucks}
      kindLocked={kindLocked}
      trigger={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${dictionary.financing.editObligation}: ${obligation.name}`}
        >
          <Pencil />
        </Button>
      }
    />
  );
}
