"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";
import { useLanguage } from "@/components/shell/language-provider";

import { createDriverAction, updateDriverAction } from "@/lib/actions/drivers";
import { DRIVER_PAY_TYPES } from "@/lib/driver-pay";
import { fieldErrors, focusFirstError, validationMessage } from "@/lib/form";
import { driverSchema } from "@/lib/schemas";
import type { Driver, DriverPayType, Truck } from "@/lib/types";
import { toNumber } from "@/lib/utils";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function DriverFormDialog({
  driver,
  trucks,
  trigger,
}: {
  driver?: Driver;
  trucks: Truck[];
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const { locale, dictionary } = useLanguage();
  const copy = dictionary.drivers;
  const common = dictionary.common;
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [name, setName] = React.useState(driver?.name ?? "");
  const [reference, setReference] = React.useState(driver?.reference ?? "");
  const [defaultTruckId, setDefaultTruckId] = React.useState(
    driver?.defaultTruckId ?? "NO_DEFAULT",
  );
  const [payType, setPayType] = React.useState<DriverPayType>(
    driver?.payType ?? "PERCENT_GROSS",
  );
  const [payRate, setPayRate] = React.useState(driver ? String(driver.payRate) : "30");

  React.useEffect(() => {
    if (!open) return;
    setName(driver?.name ?? "");
    setReference(driver?.reference ?? "");
    setDefaultTruckId(driver?.defaultTruckId ?? "NO_DEFAULT");
    setPayType(driver?.payType ?? "PERCENT_GROSS");
    setPayRate(driver ? String(driver.payRate) : "30");
    setErrors({});
  }, [open, driver]);

  const definition = DRIVER_PAY_TYPES.find((type) => type.id === payType)!;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const values = {
      name,
      reference: reference || null,
      defaultTruckId: defaultTruckId === "NO_DEFAULT" ? null : defaultTruckId,
      payType,
      payRate: toNumber(payRate),
    };
    const parsed = driverSchema.safeParse(values);
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors(next);
      toast.error(validationMessage(next, {
        name: copy.driverName,
        reference: copy.internalReference,
        defaultTruckId: copy.defaultTruck,
        payType: copy.payMethod,
        payRate: copy.payRate,
      }));
      requestAnimationFrame(() => focusFirstError("driver-form"));
      return;
    }
    startTransition(async () => {
      const result = driver
        ? await updateDriverAction(driver.id, values)
        : await createDriverAction(values);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(localizedClientError(result.error));
        return;
      }
      toast.success(driver ? copy.driverUpdated : copy.driverAdded);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus /> {copy.addDriver}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{driver ? copy.editDriver : copy.addDriver}</DialogTitle>
          <DialogDescription>
            {copy.formDescription}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form id="driver-form" onSubmit={submit} className="space-y-4" noValidate>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={copy.driverName} htmlFor="driver-name" required error={errors.name}>
                <Input
                  id="driver-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={120}
                  autoFocus
                />
              </Field>
              <Field
                label={copy.internalReference}
                htmlFor="driver-reference"
                hint={copy.referenceHint}
                error={errors.reference}
              >
                <Input
                  id="driver-reference"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  maxLength={40}
                  placeholder="DRV-001"
                />
              </Field>
            </div>
            <Field
              label={copy.defaultTruck}
              htmlFor="driver-truck"
              hint={copy.defaultTruckHint}
            >
              <Select value={defaultTruckId} onValueChange={setDefaultTruckId}>
                <SelectTrigger id="driver-truck"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NO_DEFAULT">{copy.noDefaultTruck}</SelectItem>
                  {trucks.filter((truck) => truck.active || truck.id === driver?.defaultTruckId).map((truck) => (
                    <SelectItem key={truck.id} value={truck.id}>
                      {truck.name}{truck.active ? "" : ` (${copy.retired})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={copy.payMethod} htmlFor="driver-pay-type" required>
                <Select value={payType} onValueChange={(value) => setPayType(value as DriverPayType)}>
                  <SelectTrigger id="driver-pay-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DRIVER_PAY_TYPES.map((type) => (
                      <SelectItem key={type.id} value={type.id}>{locale === "es" ? type.labelEs : type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label={locale === "es" ? definition.rateLabelEs : definition.rateLabel}
                htmlFor="driver-pay-rate"
                required
                error={errors.payRate}
                hint={locale === "es" ? definition.suffixEs : definition.suffix}
              >
                <Input
                  id="driver-pay-rate"
                  type="number"
                  min="0.01"
                  max={payType === "PERCENT_GROSS" ? "100" : "100000"}
                  step="0.01"
                  value={payRate}
                  onChange={(event) => setPayRate(event.target.value)}
                />
              </Field>
            </div>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
            {common.cancel}
          </Button>
          <Button size="sm" type="submit" form="driver-form" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : driver ? <Pencil /> : <Plus />}
            {driver ? copy.saveDriver : copy.addDriver}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
