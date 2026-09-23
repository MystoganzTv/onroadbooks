"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";
import { useLanguage } from "@/components/shell/language-provider";
import { interpolate } from "@/lib/i18n/dictionaries";

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
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/shared/field";
import { fieldErrors, focusFirstError, validationMessage } from "@/lib/form";
import { createFuelEntryAction, updateFuelEntryAction } from "@/lib/actions/fuel";
import { fuelAmounts } from "@/lib/calculations";
import { formatMoney } from "@/lib/formatters";
import { localeTag } from "@/lib/i18n-format";
import { todayISO } from "@/lib/periods";
import { fuelSchema } from "@/lib/schemas";
import { orderedTrucks } from "@/lib/fleet";
import { IFTA_JURISDICTIONS, inferFuelJurisdiction } from "@/lib/ifta";
import type { Expense, FuelEntry, Truck } from "@/lib/types";
import { toNumber } from "@/lib/utils";

interface FormState {
  date: string;
  gallons: string;
  pricePerGallon: string;
  totalCost: string;
  odometer: string;
  location: string;
  station: string;
  jurisdiction: string;
  notes: string;
}

interface FuelFormDialogProps {
  entry?: FuelEntry;
  sourceExpense?: Expense;
  /** Reuse the exact fuel form inside the expense dialog. */
  embedded?: boolean;
  onClose?: () => void;
  extraFields?: React.ReactNode;
  defaultTotalCost?: string;
  defaultStation?: string;
  defaultNotes?: string;
  trucks?: Truck[];
  defaultTruckId?: string | null;
  defaultDate?: string;
  lastOdometer?: number | null;
  trigger?: React.ReactNode;
}

/**
 * Fuel entry. Derive the missing price or total, preserving an entered
 * receipt total because pump receipts round differently.
 */
export function FuelFormDialog({
  entry,
  sourceExpense,
  embedded = false,
  onClose,
  extraFields,
  defaultTotalCost,
  defaultStation,
  defaultNotes,
  trucks = [],
  defaultTruckId,
  defaultDate,
  lastOdometer,
  trigger,
}: FuelFormDialogProps) {
  const router = useRouter();
  const { locale, dictionary } = useLanguage();
  const copy = dictionary.fuel;
  const common = dictionary.common;
  const isEdit = Boolean(entry);

  const truckOptions = React.useMemo(
    () => orderedTrucks(trucks).filter((t) => t.active || t.id === entry?.truckId || t.id === sourceExpense?.truckId),
    [trucks, entry?.truckId, sourceExpense?.truckId],
  );
  const showTruck = truckOptions.length > 1;
  const [truckId, setTruckId] = React.useState(
    () => entry?.truckId ?? defaultTruckId ?? truckOptions.find((t) => t.active)?.id ?? "",
  );

  const initial = React.useMemo<FormState>(
    () =>
      entry
        ? {
            date: entry.date,
            gallons: String(entry.gallons),
            pricePerGallon: String(entry.pricePerGallon),
            totalCost: String(entry.totalCost),
            odometer: entry.odometer ? String(entry.odometer) : "",
            location: entry.location ?? "",
            station: entry.station ?? "",
            jurisdiction: entry.jurisdiction ?? inferFuelJurisdiction(entry.location) ?? "UNASSIGNED",
            notes: entry.notes ?? "",
          }
        : {
            date: defaultDate ?? sourceExpense?.date ?? todayISO(),
            gallons: "",
            pricePerGallon: "",
            totalCost: defaultTotalCost ?? (sourceExpense ? String(sourceExpense.amount) : ""),
            odometer: "",
            location: "",
            station: defaultStation ?? sourceExpense?.vendor ?? "",
            jurisdiction: "UNASSIGNED",
            notes: defaultNotes ?? sourceExpense?.notes ?? "",
          },
    [entry, sourceExpense, defaultDate, defaultTotalCost, defaultStation, defaultNotes],
  );

  const [dialogOpen, setOpen] = React.useState(false);
  const open = embedded || dialogOpen;
  function close() {
    setOpen(false);
    onClose?.();
  }
  const [values, setValues] = React.useState<FormState>(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [costEdited, setCostEdited] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (open) {
      setTruckId(
        entry?.truckId ?? defaultTruckId ?? sourceExpense?.truckId ?? truckOptions.find((truck) => truck.active)?.id ?? "",
      );
      setValues(initial);
      setErrors({});
      setCostEdited(Boolean(entry) || initial.totalCost !== "");
    }
  }, [open, initial, entry, defaultTruckId, truckOptions, sourceExpense?.truckId]);

  const showIfta = truckOptions.find((truck) => truck.id === truckId)?.iftaReportingEnabled === true;

  const gallons = toNumber(values.gallons);
  const priceIsAutomatic = values.pricePerGallon.trim() === "";
  const { pricePerGallon: price, totalCost } = fuelAmounts(
    gallons,
    priceIsAutomatic ? null : toNumber(values.pricePerGallon),
    costEdited ? toNumber(values.totalCost) : null,
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  function submit(event: React.FormEvent) {
    event.preventDefault();

    const payload = {
      sourceExpenseId: sourceExpense?.id,
      truckId: truckId || null,
      date: values.date,
      gallons,
      pricePerGallon: price,
      totalCost,
      odometer: values.odometer ? toNumber(values.odometer) : null,
      location: values.location || null,
      station: values.station || null,
      jurisdiction: showIfta
        ? values.jurisdiction === "UNASSIGNED" ? null : values.jurisdiction
        : entry?.jurisdiction ?? null,
      notes: values.notes || null,
    };

    const parsed = fuelSchema.safeParse(payload);
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors(next);
      // A failure the user cannot see is a dead button: announce it, name the
      // fields, and move focus to the first one.
      toast.error(validationMessage(next, {
        location: copy.location,
        station: copy.station,
        gallons: copy.gallons,
        pricePerGallon: copy.priceGal,
        totalCost: copy.totalCost,
        odometer: copy.odometer,
        date: copy.date,
        notes: copy.notes,
      }));
      requestAnimationFrame(() => focusFirstError("fuel-form"));
      return;
    }

    setErrors({});
    startTransition(async () => {
      const result = isEdit
        ? await updateFuelEntryAction(entry!.id, payload)
        : await createFuelEntryAction(payload);

      if (result.ok) {
        toast.success(isEdit ? copy.entryUpdated : copy.entryAdded, {
          description: `${gallons.toFixed(1)} gal - ${formatMoney(totalCost)}`,
        });
        close();
        router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(localizedClientError(result.error));
      }
    });
  }

  const content = (
    <>
        <DialogHeader>
          <DialogTitle>{isEdit ? copy.editFuel : copy.addFuelEntry}</DialogTitle>
          <DialogDescription>
            {sourceExpense ? copy.completeExpenseDescription : copy.formDescription}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <form id="fuel-form" onSubmit={submit} className="space-y-4" noValidate>
            {extraFields}
            {showTruck ? (
              <Field
                label={copy.truck}
                htmlFor="fuel-truck"
                required
                hint={copy.truckHint}
              >
                <Select value={truckId} onValueChange={setTruckId}>
                  <SelectTrigger id="fuel-truck">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {truckOptions.map((truck) => (
                      <SelectItem key={truck.id} value={truck.id}>
                        {truck.name}
                        {truck.active ? "" : ` (${copy.retired})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <Field label={copy.date} htmlFor="fuel-date" required error={errors.date}>
                <Input
                  id="fuel-date"
                  type="date"
                  value={values.date}
                  onChange={(e) => set("date", e.target.value)}
                  aria-invalid={Boolean(errors.date)}
                  required
                />
              </Field>
              <Field label={copy.station} htmlFor="fuel-station" error={errors.station} hint={copy.optional}>
                <Input
                  id="fuel-station"
                  maxLength={120}
                  aria-invalid={Boolean(errors.station)}
                  aria-describedby="fuel-station-message"
                  value={values.station}
                  onChange={(e) => set("station", e.target.value)}
                  placeholder="Love’s, Pilot, Flying J…"
                />
              </Field>
              <Field label={copy.location} htmlFor="fuel-location" error={errors.location}>
                <Input
                  id="fuel-location"
                  maxLength={120}
                  aria-invalid={Boolean(errors.location)}
                  value={values.location}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="Baltimore, MD"
                />
              </Field>
              {showIfta ? <Field
                label={copy.jurisdiction}
                htmlFor="fuel-jurisdiction"
                error={errors.jurisdiction}
                hint={copy.taxPaidGallons}
              >
                <Select
                  value={values.jurisdiction}
                  onValueChange={(value) => set("jurisdiction", value)}
                >
                  <SelectTrigger id="fuel-jurisdiction" aria-invalid={Boolean(errors.jurisdiction)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNASSIGNED">{copy.unassigned}</SelectItem>
                    {IFTA_JURISDICTIONS.map((jurisdiction) => (
                      <SelectItem key={jurisdiction} value={jurisdiction}>
                        {jurisdiction}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field> : null}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label={copy.gallons} htmlFor="fuel-gallons" required error={errors.gallons}>
                <Input
                  id="fuel-gallons"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.1"
                  value={values.gallons}
                  onChange={(e) => set("gallons", e.target.value)}
                  aria-invalid={Boolean(errors.gallons)}
                  required
                />
              </Field>
              <Field
                label={copy.priceGal}
                htmlFor="fuel-price"
                hint={priceIsAutomatic && price > 0 ? undefined : copy.priceHint}
                error={errors.pricePerGallon}
              >
                <Input
                  id="fuel-price"
                  className="placeholder:text-foreground"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.001"
                  value={values.pricePerGallon}
                  placeholder={priceIsAutomatic && price > 0 ? price.toFixed(3) : ""}
                  onChange={(e) => set("pricePerGallon", e.target.value)}
                  aria-invalid={Boolean(errors.pricePerGallon)}
                  aria-describedby={errors.pricePerGallon || !(priceIsAutomatic && price > 0) ? "fuel-price-message" : undefined}
                />
              </Field>
              <Field
                label={copy.totalCost}
                htmlFor="fuel-total"
                error={errors.totalCost}
              >
                <Input
                  id="fuel-total"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={costEdited ? values.totalCost : totalCost ? totalCost.toFixed(2) : ""}
                  onChange={(e) => {
                    setCostEdited(true);
                    set("totalCost", e.target.value);
                  }}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label={copy.odometer}
                htmlFor="fuel-odometer"
                hint={lastOdometer ? interpolate(copy.lastReading, { value: lastOdometer.toLocaleString(localeTag(locale)) }) : copy.optional}
                error={errors.odometer}
              >
                <Input
                  id="fuel-odometer"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={values.odometer}
                  onChange={(e) => set("odometer", e.target.value)}
                />
              </Field>
            </div>

            <Field label={copy.notes} htmlFor="fuel-notes" error={errors.notes}>
              <Textarea
                id="fuel-notes"
                rows={2}
                maxLength={2000}
                value={values.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder={copy.optional}
                aria-invalid={Boolean(errors.notes)}
              />
            </Field>

            <p className="rounded-md border border-border bg-surface-sunken px-3 py-2 text-2xs text-muted-foreground">
              {sourceExpense ? copy.completeExpenseDescription : copy.ledgerNotice}
            </p>
          </form>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={close}>
            {common.cancel}
          </Button>
          <Button type="submit" form="fuel-form" size="sm" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {isEdit || sourceExpense ? common.saveChanges : copy.addFuel}
          </Button>
        </DialogFooter>
    </>
  );

  if (embedded) return content;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button size="sm"><Plus />{copy.addFuel}</Button>}
      </DialogTrigger>
      <DialogContent>{content}</DialogContent>
    </Dialog>
  );
}
