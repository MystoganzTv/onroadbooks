"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

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
import { formatDateShort, formatMoney } from "@/lib/formatters";
import { todayISO } from "@/lib/periods";
import { fuelSchema } from "@/lib/schemas";
import { orderedTrucks } from "@/lib/fleet";
import type { FuelEntry, LoadWithMetrics, Truck } from "@/lib/types";
import { toNumber } from "@/lib/utils";

const FIELD_LABELS: Record<string, string> = {
  location: "Location",
  gallons: "Gallons",
  pricePerGallon: "Price per gallon",
  totalCost: "Total cost",
  odometer: "Odometer",
  date: "Date",
  notes: "Notes",
};

interface FormState {
  date: string;
  gallons: string;
  pricePerGallon: string;
  totalCost: string;
  odometer: string;
  location: string;
  loadId: string;
  notes: string;
}

interface FuelFormDialogProps {
  entry?: FuelEntry;
  loads?: LoadWithMetrics[];
  trucks?: Truck[];
  defaultTruckId?: string | null;
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
  defaultDate,
  lastOdometer,
  trigger,
}: FuelFormDialogProps) {
  const router = useRouter();
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
            loadId: "none",
            notes: "",
          },
    [entry, defaultDate],
  );

  const [open, setOpen] = React.useState(false);
  const [values, setValues] = React.useState<FormState>(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [costEdited, setCostEdited] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (open) {
      setValues(initial);
      setErrors({});
      setCostEdited(Boolean(entry));
    }
  }, [open, initial, entry]);

  const gallons = toNumber(values.gallons);
  const price = toNumber(values.pricePerGallon);
  const derivedCost = roundMoney(gallons * price);
  const totalCost = costEdited ? toNumber(values.totalCost) : derivedCost;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  // Same as the expense form: a link made in another period must stay
  // visible, or the select renders empty and looks unlinked.
  const linkOptions = React.useMemo(() => {
    const visible = loads.slice(0, 40);
    const linkedId = entry?.loadId;
    if (!linkedId || visible.some((l) => l.id === linkedId)) return visible;
    const linked = loads.find((l) => l.id === linkedId);
    return linked ? [linked, ...visible] : visible;
  }, [loads, entry?.loadId]);

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
      loadId: values.loadId === "none" ? null : values.loadId,
      notes: values.notes || null,
    };

    const parsed = fuelSchema.safeParse(payload);
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors(next);
      // A failure the user cannot see is a dead button: announce it, name the
      // fields, and move focus to the first one.
      toast.error(validationMessage(next, FIELD_LABELS));
      requestAnimationFrame(() => focusFirstError("fuel-form"));
      return;
    }

    setErrors({});
    startTransition(async () => {
      const result = isEdit
        ? await updateFuelEntryAction(entry!.id, payload)
        : await createFuelEntryAction(payload);

      if (result.ok) {
        toast.success(isEdit ? "Fuel entry updated" : "Fuel entry added", {
          description: `${gallons.toFixed(1)} gal - ${formatMoney(totalCost)}`,
        });
        setOpen(false);
        router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus />
            Add Fuel
          </Button>
        )}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit fuel entry" : "Add fuel entry"}</DialogTitle>
          <DialogDescription>
            Recording an odometer reading every fill-up is what makes MPG tracking work.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <form id="fuel-form" onSubmit={submit} className="space-y-4" noValidate>
            {showTruck ? (
              <Field
                label="Truck"
                htmlFor="fuel-truck"
                required
                hint="Sets the odometer this reading belongs to"
              >
                <Select value={truckId} onValueChange={setTruckId}>
                  <SelectTrigger id="fuel-truck">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {truckOptions.map((truck) => (
                      <SelectItem key={truck.id} value={truck.id}>
                        {truck.name}
                        {truck.active ? "" : " (retired)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" htmlFor="fuel-date" required error={errors.date}>
                <Input
                  id="fuel-date"
                  type="date"
                  value={values.date}
                  onChange={(e) => set("date", e.target.value)}
                  aria-invalid={Boolean(errors.date)}
                  required
                />
              </Field>
              <Field label="Location" htmlFor="fuel-location" error={errors.location}>
                <Input
                  id="fuel-location"
                  maxLength={120}
                  aria-invalid={Boolean(errors.location)}
                  value={values.location}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="Baltimore, MD"
                />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Gallons" htmlFor="fuel-gallons" required error={errors.gallons}>
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
                label="Price / gal"
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
                label="Total cost"
                htmlFor="fuel-total"
                error={errors.totalCost}
                hint={costEdited ? undefined : "Auto"}
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
                label="Odometer"
                htmlFor="fuel-odometer"
                hint={lastOdometer ? `Last reading ${lastOdometer.toLocaleString()}` : "Optional"}
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
              <Field label="Link to load" htmlFor="fuel-load">
                <Select value={values.loadId} onValueChange={(value) => set("loadId", value)}>
                  <SelectTrigger id="fuel-load">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not linked</SelectItem>
                    {/* The list is period-filtered, so a link made in another
                        period would otherwise render as a blank selection. */}
                    {linkOptions.map((load) => (
                      <SelectItem key={load.id} value={load.id}>
                        {formatDateShort(load.date)} - {load.originCity} to {load.destinationCity}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Notes" htmlFor="fuel-notes" error={errors.notes}>
              <Textarea
                id="fuel-notes"
                rows={2}
                maxLength={2000}
                value={values.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Optional"
                aria-invalid={Boolean(errors.notes)}
              />
            </Field>

            <p className="rounded-md border border-border bg-surface-sunken px-3 py-2 text-2xs text-muted-foreground">
              Saving also records a matching{" "}
              <span className="text-foreground">Fuel</span> row in the expense ledger, so operating
              costs stay complete without entering it twice.
            </p>
          </form>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="fuel-form" size="sm" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {isEdit ? "Save changes" : "Add fuel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
