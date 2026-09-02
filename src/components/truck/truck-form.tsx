"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";
import { useLanguage } from "@/components/shell/language-provider";

import { Field } from "@/components/shared/field";
import { fieldErrors, focusFirstError, validationMessage } from "@/lib/form";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateTruckAction } from "@/lib/actions/settings";
import { iftaApplicability, iftaApplicabilityLabel } from "@/lib/ifta-eligibility";
import { truckSchema } from "@/lib/schemas";
import type { Truck } from "@/lib/types";
import { toNumber, toRequiredNumber } from "@/lib/utils";

function initialState(truck: Truck) {
  return {
    name: truck.name,
    year: truck.year ? String(truck.year) : "",
    make: truck.make ?? "",
    model: truck.model ?? "",
    vin: truck.vin ?? "",
    purchasePrice: truck.purchasePrice ? String(truck.purchasePrice) : "",
    monthlyPayment: truck.monthlyPayment ? String(truck.monthlyPayment) : "",
    monthlyInsurance: truck.monthlyInsurance ? String(truck.monthlyInsurance) : "",
    axleCount: truck.axleCount ? String(truck.axleCount) : "",
    registeredGrossWeightLbs: truck.registeredGrossWeightLbs
      ? String(truck.registeredGrossWeightLbs)
      : "",
    operatesInMultipleIftaJurisdictions:
      truck.operatesInMultipleIftaJurisdictions == null
        ? "UNKNOWN"
        : truck.operatesInMultipleIftaJurisdictions
          ? "YES"
          : "NO",
    iftaReportingEnabled:
      truck.iftaReportingEnabled == null
        ? "UNDECIDED"
        : truck.iftaReportingEnabled
          ? "INCLUDED"
          : "EXCLUDED",
    startingOdometer: String(truck.startingOdometer),
    currentOdometer: String(truck.currentOdometer),
  };
}

const FIELD_LABELS: Record<string, string> = {
  name: "Truck name",
  year: "Year",
  make: "Make",
  model: "Model",
  vin: "VIN",
  purchasePrice: "Purchase price",
  monthlyPayment: "Monthly payment",
  monthlyInsurance: "Monthly insurance",
  axleCount: "Power-unit axles",
  registeredGrossWeightLbs: "Registered gross/combined weight",
  startingOdometer: "Starting odometer",
  currentOdometer: "Current odometer",
};

export function TruckForm({
  truck,
  onCancel,
  onSaved,
}: {
  truck: Truck;
  onCancel?: () => void;
  onSaved?: () => void;
}) {
  const { dictionary, locale } = useLanguage();
  const copy = dictionary.truck;
  const router = useRouter();
  const [values, setValues] = React.useState(() => initialState(truck));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, startTransition] = React.useTransition();

  const set = (key: keyof ReturnType<typeof initialState>, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  function submit(event: React.FormEvent) {
    event.preventDefault();

    const payload = {
      name: values.name,
      year: values.year ? toNumber(values.year) : null,
      make: values.make || null,
      model: values.model || null,
      vin: values.vin || null,
      purchasePrice: values.purchasePrice ? toNumber(values.purchasePrice) : null,
      monthlyPayment: values.monthlyPayment ? toNumber(values.monthlyPayment) : null,
      monthlyInsurance: values.monthlyInsurance ? toNumber(values.monthlyInsurance) : null,
      axleCount: values.axleCount ? toNumber(values.axleCount) : null,
      registeredGrossWeightLbs: values.registeredGrossWeightLbs
        ? toNumber(values.registeredGrossWeightLbs)
        : null,
      operatesInMultipleIftaJurisdictions:
        values.operatesInMultipleIftaJurisdictions === "UNKNOWN"
          ? null
          : values.operatesInMultipleIftaJurisdictions === "YES",
      iftaReportingEnabled:
        values.iftaReportingEnabled === "UNDECIDED"
          ? null
          : values.iftaReportingEnabled === "INCLUDED",
      startingOdometer: toRequiredNumber(values.startingOdometer),
      currentOdometer: toRequiredNumber(values.currentOdometer),
    };

    const parsed = truckSchema.safeParse(payload);
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors(next);
      // A failure the user cannot see is a dead button: announce it, name the
      // fields, and move focus to the first one.
      toast.error(validationMessage(next, FIELD_LABELS));
      requestAnimationFrame(() => focusFirstError("truck-form"));
      return;
    }

    if (
      payload.currentOdometer !== undefined &&
      payload.startingOdometer !== undefined &&
      payload.currentOdometer < payload.startingOdometer
    ) {
      setErrors({ currentOdometer: copy.odometerBelow });
      return;
    }

    setErrors({});
    startTransition(async () => {
      const result = await updateTruckAction(payload);
      if (result.ok) {
        toast.success(copy.detailsSaved);
        onSaved?.();
        router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(localizedClientError(result.error));
      }
    });
  }

  const iftaStatus = iftaApplicability({
    axleCount: values.axleCount ? toNumber(values.axleCount) : null,
    registeredGrossWeightLbs: values.registeredGrossWeightLbs
      ? toNumber(values.registeredGrossWeightLbs)
      : null,
    operatesInMultipleIftaJurisdictions:
      values.operatesInMultipleIftaJurisdictions === "UNKNOWN"
        ? null
        : values.operatesInMultipleIftaJurisdictions === "YES",
  });

  return (
    <form
      id="truck-form"
      onSubmit={submit}
      noValidate
      className="rounded-lg border border-border bg-card text-card-foreground"
    >
        <CardHeader>
          <CardTitle>{copy.details}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label={copy.truckName} htmlFor="truck-name" required error={errors.name} className="sm:col-span-2">
              <Input
                id="truck-name"
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
                required
                aria-invalid={Boolean(errors.name)}
              />
            </Field>
            <Field label={copy.year} htmlFor="truck-year" error={errors.year}>
              <Input
                id="truck-year"
                type="number"
                min={1950}
                max={2100}
                value={values.year}
                onChange={(e) => set("year", e.target.value)}
              />
            </Field>
            <Field label={copy.make} htmlFor="truck-make" error={errors.make}>
              <Input
                id="truck-make"
                maxLength={60}
                aria-invalid={Boolean(errors.make)}
                value={values.make}
                onChange={(e) => set("make", e.target.value)}
                placeholder="Freightliner"
              />
            </Field>
            <Field label={copy.model} htmlFor="truck-model" className="sm:col-span-2" error={errors.model}>
              <Input
                id="truck-model"
                maxLength={80}
                aria-invalid={Boolean(errors.model)}
                value={values.model}
                onChange={(e) => set("model", e.target.value)}
                placeholder="M2 106 - 26ft Box"
              />
            </Field>
            <Field label="VIN" htmlFor="truck-vin" className="sm:col-span-2">
              <Input
                id="truck-vin"
                value={values.vin}
                onChange={(e) => set("vin", e.target.value.toUpperCase())}
                placeholder={copy.optional}
                maxLength={24}
              />
            </Field>
          </div>

          <div className="space-y-3 rounded-lg border border-border bg-surface-sunken/40 p-3">
            <div>
              <p className="text-xs font-semibold">{copy.iftaQualification}</p>
              <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">
                {copy.iftaQualificationDescription}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={copy.powerAxles} htmlFor="truck-axles" error={errors.axleCount}>
                <Input
                  id="truck-axles"
                  type="number"
                  min={2}
                  max={10}
                  step={1}
                  value={values.axleCount}
                  onChange={(e) => set("axleCount", e.target.value)}
                  placeholder="2"
                />
              </Field>
              <Field
                label={copy.registeredWeight}
                htmlFor="truck-registered-weight"
                hint="lb"
                error={errors.registeredGrossWeightLbs}
              >
                <Input
                  id="truck-registered-weight"
                  type="number"
                  min={1_000}
                  max={200_000}
                  step={1}
                  value={values.registeredGrossWeightLbs}
                  onChange={(e) => set("registeredGrossWeightLbs", e.target.value)}
                  placeholder="26000"
                />
              </Field>
            </div>
            <Field
              label={copy.operatingArea}
              htmlFor="truck-ifta-jurisdictions"
              hint={copy.operatingAreaHint}
            >
              <Select
                value={values.operatesInMultipleIftaJurisdictions}
                onValueChange={(value) => set("operatesInMultipleIftaJurisdictions", value)}
              >
                <SelectTrigger id="truck-ifta-jurisdictions"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UNKNOWN">{copy.unsure}</SelectItem>
                  <SelectItem value="YES">{copy.multipleJurisdictions}</SelectItem>
                  <SelectItem value="NO">{copy.oneJurisdiction}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <p className="text-2xs leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">
                {iftaApplicabilityLabel(iftaStatus, locale)}.
              </span>{" "}
              {copy.confirmBase}
            </p>
            <Field
              label={copy.quarterlyIfta}
              htmlFor="truck-ifta-reporting"
              hint={copy.quarterlyIftaHint}
            >
              <Select
                value={values.iftaReportingEnabled}
                onValueChange={(value) => set("iftaReportingEnabled", value)}
              >
                <SelectTrigger id="truck-ifta-reporting"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UNDECIDED">{copy.decisionNeeded}</SelectItem>
                  <SelectItem value="INCLUDED">{copy.includeIfta}</SelectItem>
                  <SelectItem value="EXCLUDED">{copy.excludeIfta}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label={copy.purchasePrice} htmlFor="truck-price" error={errors.purchasePrice}>
              <Input
                id="truck-price"
                type="number"
                min={0}
                step="0.01"
                value={values.purchasePrice}
                onChange={(e) => set("purchasePrice", e.target.value)}
              />
            </Field>
            <Field label={copy.monthlyPayment} htmlFor="truck-payment" error={errors.monthlyPayment}>
              <Input
                id="truck-payment"
                type="number"
                min={0}
                step="0.01"
                value={values.monthlyPayment}
                onChange={(e) => set("monthlyPayment", e.target.value)}
              />
            </Field>
            <Field label={copy.monthlyInsurance} htmlFor="truck-insurance" error={errors.monthlyInsurance}>
              <Input
                id="truck-insurance"
                type="number"
                min={0}
                step="0.01"
                value={values.monthlyInsurance}
                onChange={(e) => set("monthlyInsurance", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label={copy.startingOdometer}
              htmlFor="truck-start-odo"
              error={errors.startingOdometer}
              hint={copy.startingHint}
            >
              <Input
                id="truck-start-odo"
                type="number"
                min={0}
                step={1}
                value={values.startingOdometer}
                onChange={(e) => set("startingOdometer", e.target.value)}
                required
              />
            </Field>
            <Field
              label={copy.currentOdometer}
              htmlFor="truck-current-odo"
              error={errors.currentOdometer}
              hint={copy.currentHint}
            >
              <Input
                id="truck-current-odo"
                type="number"
                min={0}
                step={1}
                value={values.currentOdometer}
                onChange={(e) => set("currentOdometer", e.target.value)}
                required
              />
            </Field>
          </div>
        </CardContent>
      <CardFooter className="justify-end gap-2">
        {onCancel ? (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onCancel}>
            <X className="size-4" />
            {dictionary.common.cancel}
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />}
          {copy.saveTruck}
        </Button>
      </CardFooter>
    </form>
  );
}
