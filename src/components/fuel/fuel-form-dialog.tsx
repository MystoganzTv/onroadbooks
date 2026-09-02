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
import { roundMoney } from "@/lib/calculations";
import { formatMoney } from "@/lib/formatters";
import { formatLocaleDate, localeTag } from "@/lib/i18n-format";
import { todayISO } from "@/lib/periods";
import { fuelSchema } from "@/lib/schemas";
import { orderedTrucks } from "@/lib/fleet";
import { IFTA_JURISDICTIONS, inferFuelJurisdiction } from "@/lib/ifta";
import type { FuelEntry, LoadWithMetrics, Truck } from "@/lib/types";
import { toNumber } from "@/lib/utils";

interface FormState {
  date: string;
  gallons: string;
  pricePerGallon: string;
  totalCost: string;
  odometer: string;
  location: string;
  jurisdiction: string;
  loadId: string;
  notes: string;
}

interface FuelFormDialogProps {
  entry?: FuelEntry;
  loads?: LoadWithMetrics[];
  trucks?: Truck[];
  defaultTruckId?: string | null;
  defaultLoadId?: string | null;
  defaultDate?: string;
  lastOdometer?: number | null;
  trigger?: React.ReactNode;
}

/**
 * Fuel entry. Total cost auto-derives from gallons x price, but stays
 * editable because pump receipts round differently.
 */
export function FuelFormDialog({
  entry,
  loads = [],
  trucks = [],
  defaultTruckId,
  defaultLoadId,
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
    () => orderedTrucks(trucks).filter((t) => t.active || t.id === entry?.truckId),
    [trucks, entry?.truckId],
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
            jurisdiction: entry.jurisdiction ?? inferFuelJurisdiction(entry.location) ?? "UNASSIGNED",
            loadId: entry.loadId ?? "none",
            notes: entry.notes ?? "",
          }
        : {
            date: defaultDate ?? todayISO(),
            gallons: "",
            pricePerGallon: "",
            totalCost: "",
            odometer: "",
            location: "",
            jurisdiction: "UNASSIGNED",
            loadId: defaultLoadId ?? "none",
            notes: "",
          },
    [entry, defaultDate, defaultLoadId],
  );

  const [open, setOpen] = React.useState(false);
  const [values, setValues] = React.useState<FormState>(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [costEdited, setCostEdited] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (open) {
      setTruckId(
        entry?.truckId ?? defaultTruckId ?? truckOptions.find((truck) => truck.active)?.id ?? "",
      );
      setValues(initial);
      setErrors({});
      setCostEdited(Boolean(entry));
    }
  }, [open, initial, entry, defaultTruckId, truckOptions]);

  const gallons = toNumber(values.gallons);
  const price = toNumber(values.pricePerGallon);
  const derivedCost = roundMoney(gallons * price);
  const totalCost = costEdited ? toNumber(values.totalCost) : derivedCost;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  // Same as the expense form: a link made in another period must stay
  // visible, or the select renders empty and looks unlinked.
  const linkOptions = React.useMemo(() => {
    const matching = loads.filter((load) => load.truckId === truckId);
    const visible = matching.slice(0, 40);
    const linkedId = entry?.loadId ?? defaultLoadId;
    if (!linkedId || visible.some((l) => l.id === linkedId)) return visible;
    const linked = matching.find((l) => l.id === linkedId);
    return linked ? [linked, ...visible] : visible;
  }, [loads, entry?.loadId, defaultLoadId, truckId]);

  function changeTruck(nextTruckId: string) {
    setTruckId(nextTruckId);
    setValues((prev) => {
      const linked = loads.find((load) => load.id === prev.loadId);
      return {
        ...prev,
        loadId: linked?.truckId === nextTruckId ? prev.loadId : "none",
      };
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();

    const payload = {
      truckId: truckId || null,
      date: values.date,
      gallons,
      pricePerGallon: price,
      totalCost,
      odometer: values.odometer ? toNumber(values.odometer) : null,
      location: values.location || null,
      jurisdiction: values.jurisdiction === "UNASSIGNED" ? null : values.jurisdiction,
      loadId: values.loadId === "none" ? null : values.loadId,
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
        setOpen(false);
        router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(localizedClientError(result.error));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus />
            {copy.addFuel}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? copy.editFuel : copy.addFuelEntry}</DialogTitle>
          <DialogDescription>
            {copy.formDescription}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <form id="fuel-form" onSubmit={submit} className="space-y-4" noValidate>
            {showTruck ? (
              <Field
                label={copy.truck}
                htmlFor="fuel-truck"
                required
                hint={copy.truckHint}
              >
                <Select value={truckId} onValueChange={changeTruck}>
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

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
              <Field
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
              </Field>
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
                required
                error={errors.pricePerGallon}
              >
                <Input
                  id="fuel-price"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.001"
                  value={values.pricePerGallon}
                  onChange={(e) => set("pricePerGallon", e.target.value)}
                  aria-invalid={Boolean(errors.pricePerGallon)}
                  required
                />
              </Field>
              <Field
                label={copy.totalCost}
                htmlFor="fuel-total"
                error={errors.totalCost}
                hint={costEdited ? undefined : copy.auto}
              >
                <Input
                  id="fuel-total"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={costEdited ? values.totalCost : derivedCost ? derivedCost.toFixed(2) : ""}
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
                  placeholder={lastOdometer ? String(lastOdometer + 400) : ""}
                />
              </Field>
              <Field
                label={copy.linkToLoad}
                htmlFor="fuel-load"
                hint={copy.truckLoadsOnly}
              >
                <Select value={values.loadId} onValueChange={(value) => set("loadId", value)}>
                  <SelectTrigger id="fuel-load">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{copy.notLinked}</SelectItem>
                    {/* The list is period-filtered, so a link made in another
                        period would otherwise render as a blank selection. */}
                    {linkOptions.map((load) => (
                      <SelectItem key={load.id} value={load.id}>
                        {formatLocaleDate(load.date, locale, "short")} · {load.originCity} {copy.routeConnector} {load.destinationCity}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              {copy.ledgerNotice}
            </p>
          </form>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
            {common.cancel}
          </Button>
          <Button type="submit" form="fuel-form" size="sm" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {isEdit ? common.saveChanges : copy.addFuel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
