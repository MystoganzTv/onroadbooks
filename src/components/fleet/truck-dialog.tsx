"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

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
import { createTruckAction } from "@/lib/actions/trucks";
import { fieldErrors, focusFirstError, validationMessage } from "@/lib/form";
import { truckSchema } from "@/lib/schemas";
import { todayISO } from "@/lib/periods";
import { toNumber, toRequiredNumber } from "@/lib/utils";

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  year: "Year",
  make: "Make",
  model: "Model",
  startingOdometer: "Starting odometer",
  currentOdometer: "Current odometer",
  axleCount: "Power-unit axles",
  registeredGrossWeightLbs: "Registered gross/combined weight",
};

/** Adding a unit to the fleet. Refused server-side when the plan is full. */
export function TruckDialog({
  canAdd,
  limitReason,
}: {
  canAdd: boolean;
  limitReason: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const [values, setValues] = React.useState({
    name: "",
    year: "",
    make: "",
    model: "",
    vin: "",
    odometer: "",
    monthlyPayment: "",
    monthlyInsurance: "",
    axleCount: "",
    registeredGrossWeightLbs: "",
    operatesInMultipleIftaJurisdictions: "UNKNOWN",
    acquiredOn: todayISO(),
  });

  const set = (key: keyof typeof values, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  React.useEffect(() => {
    if (!open) return;
    setErrors({});
  }, [open]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const odometer = toNumber(values.odometer);
    const payload = {
      name: values.name,
      acquiredOn: values.acquiredOn || null,
      year: toRequiredNumber(values.year) ?? null,
      make: values.make || null,
      model: values.model || null,
      vin: values.vin || null,
      purchasePrice: null,
      monthlyPayment: toRequiredNumber(values.monthlyPayment) ?? null,
      monthlyInsurance: toRequiredNumber(values.monthlyInsurance) ?? null,
      axleCount: toRequiredNumber(values.axleCount) ?? null,
      registeredGrossWeightLbs: toRequiredNumber(values.registeredGrossWeightLbs) ?? null,
      operatesInMultipleIftaJurisdictions:
        values.operatesInMultipleIftaJurisdictions === "UNKNOWN"
          ? null
          : values.operatesInMultipleIftaJurisdictions === "YES",
      // A truck joins the fleet at the odometer it is on; that reading is both
      // where its history starts and where it is right now.
      startingOdometer: odometer,
      currentOdometer: odometer,
    };

    const parsed = truckSchema.safeParse(payload);
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors(next);
      toast.error(validationMessage(next, FIELD_LABELS));
      requestAnimationFrame(() => focusFirstError("new-truck-form"));
      return;
    }

    setErrors({});
    startTransition(async () => {
      const result = await createTruckAction(payload);
      if (result.ok) {
        toast.success(`${values.name} added to the fleet`);
        setOpen(false);
        setValues((prev) => ({ ...prev, name: "", vin: "", odometer: "" }));
        router.refresh();
      } else {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error);
      }
    });
  }

  if (!canAdd) {
    return (
      <Button type="button" size="sm" variant="outline" disabled title={limitReason ?? undefined}>
        <Plus className="size-4" />
        Add truck
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <Plus className="size-4" />
          Add truck
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <form id="new-truck-form" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Add a truck</DialogTitle>
            <DialogDescription>
              Its costs and revenue are tracked separately, so you can see which unit pays for
              itself.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="new-truck-name" required error={errors.name}>
              <Input
                id="new-truck-name"
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Unit 102"
                maxLength={80}
                autoFocus
              />
            </Field>
            <Field
              label="Current odometer"
              htmlFor="new-truck-odo"
              required
              error={errors.currentOdometer}
            >
              <Input
                id="new-truck-odo"
                inputMode="numeric"
                value={values.odometer}
                onChange={(e) => set("odometer", e.target.value)}
              />
            </Field>
            <Field label="Year" htmlFor="new-truck-year" error={errors.year}>
              <Input
                id="new-truck-year"
                inputMode="numeric"
                value={values.year}
                onChange={(e) => set("year", e.target.value)}
              />
            </Field>
            <Field label="Make and model" htmlFor="new-truck-make">
              <div className="flex gap-2">
                <Input
                  id="new-truck-make"
                  value={values.make}
                  onChange={(e) => set("make", e.target.value)}
                  placeholder="Freightliner"
                />
                <Input
                  aria-label="Model"
                  value={values.model}
                  onChange={(e) => set("model", e.target.value)}
                  placeholder="M2 106"
                />
              </div>
            </Field>
            <Field label="Monthly payment" htmlFor="new-truck-payment">
              <Input
                id="new-truck-payment"
                inputMode="decimal"
                value={values.monthlyPayment}
                onChange={(e) => set("monthlyPayment", e.target.value)}
              />
            </Field>
            <Field label="Monthly insurance" htmlFor="new-truck-ins">
              <Input
                id="new-truck-ins"
                inputMode="decimal"
                value={values.monthlyInsurance}
                onChange={(e) => set("monthlyInsurance", e.target.value)}
              />
            </Field>
            <Field label="Power-unit axles" htmlFor="new-truck-axles" error={errors.axleCount}>
              <Input
                id="new-truck-axles"
                inputMode="numeric"
                value={values.axleCount}
                onChange={(e) => set("axleCount", e.target.value)}
                placeholder="2"
              />
            </Field>
            <Field
              label="Registered gross/combined weight"
              htmlFor="new-truck-weight"
              hint="lb"
              error={errors.registeredGrossWeightLbs}
            >
              <Input
                id="new-truck-weight"
                inputMode="numeric"
                value={values.registeredGrossWeightLbs}
                onChange={(e) => set("registeredGrossWeightLbs", e.target.value)}
                placeholder="26000"
              />
            </Field>
            <Field
              label="Operating area"
              htmlFor="new-truck-ifta-jurisdictions"
              className="sm:col-span-2"
              hint="Will this unit operate in two or more IFTA jurisdictions?"
            >
              <Select
                value={values.operatesInMultipleIftaJurisdictions}
                onValueChange={(value) => set("operatesInMultipleIftaJurisdictions", value)}
              >
                <SelectTrigger id="new-truck-ifta-jurisdictions"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UNKNOWN">Not sure yet</SelectItem>
                  <SelectItem value="YES">Two or more IFTA jurisdictions</SelectItem>
                  <SelectItem value="NO">One jurisdiction only</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="In service since"
              htmlFor="new-truck-acquired"
              className="sm:col-span-2"
              hint="Used so reports know when it joined the fleet"
            >
              <Input
                id="new-truck-acquired"
                type="date"
                value={values.acquiredOn}
                onChange={(e) => set("acquiredOn", e.target.value)}
              />
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Add truck
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
