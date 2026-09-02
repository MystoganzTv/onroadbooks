"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowUpRight, Loader2, Plus, Trash2 } from "lucide-react";
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
import {
  DocumentUploader,
  uploadPending,
  type PendingUpload,
} from "@/components/documents/document-uploader";
import { createLoadAction, updateLoadAction } from "@/lib/actions/loads";
import { div, rateLoad, roundMoney, type RatingThresholds } from "@/lib/calculations";
import { PAYMENT_STATUSES } from "@/lib/categories";
import {
  findDriverScheduleConflicts,
  type DriverScheduleEntry,
} from "@/lib/driver-availability";
import { formatDateShort, formatMiles, formatMoney, formatRateValue } from "@/lib/formatters";
import { loadSchema } from "@/lib/schemas";
import { todayISO } from "@/lib/periods";
import { orderedTrucks } from "@/lib/fleet";
import { IFTA_JURISDICTIONS } from "@/lib/ifta";
import { EQUIPMENT_TYPES, LOAD_CAPACITIES } from "@/lib/load-details";
import type { Driver, EquipmentType, Load, LoadCapacity, PaymentStatus, Truck } from "@/lib/types";
import { toNumber } from "@/lib/utils";

const FIELD_LABELS: Record<string, string> = {
  broker: "Broker",
  loadNumber: "Load number",
  notes: "Notes",
  deliveryDate: "Delivery date",
  endingOdometer: "Ending odometer",
  originCity: "Origin city",
  originState: "Origin state",
  destinationCity: "Destination city",
  destinationState: "Destination state",
  loadedMiles: "Loaded miles",
  deadheadMiles: "Deadhead miles",
  grossRate: "Gross rate",
  fuelCost: "Trip fuel",
  tolls: "Tolls",
  dispatchFee: "Dispatch",
  factoringFee: "Factoring",
  otherExpenses: "Other",
  date: "Pickup date",
  equipmentLengthFt: "Equipment length",
  weightLbs: "Weight",
  commodity: "Commodity",
};

interface FormState {
  truckId: string;
  driverId: string;
  date: string;
  deliveryDate: string;
  originCity: string;
  originState: string;
  destinationCity: string;
  destinationState: string;
  broker: string;
  loadNumber: string;
  equipmentType: EquipmentType | "UNSPECIFIED";
  loadCapacity: LoadCapacity | "UNSPECIFIED";
  equipmentLengthFt: string;
  weightLbs: string;
  commodity: string;
  endingOdometer: string;
  loadedMiles: string;
  deadheadMiles: string;
  grossRate: string;
  fuelCost: string;
  tolls: string;
  dispatchFee: string;
  factoringFee: string;
  otherExpenses: string;
  status: PaymentStatus;
  jurisdictionMiles: JurisdictionRow[];
  notes: string;
}

interface JurisdictionRow {
  id: string;
  jurisdiction: string;
  totalMiles: string;
  nonTaxableMiles: string;
}

function emptyState(defaultDate: string, truckId: string): FormState {
  return {
    truckId,
    driverId: "UNASSIGNED",
    date: defaultDate,
    deliveryDate: "",
    originCity: "",
    originState: "",
    destinationCity: "",
    destinationState: "",
    broker: "",
    loadNumber: "",
    equipmentType: "BOX_TRUCK",
    loadCapacity: "FULL",
    equipmentLengthFt: "26",
    weightLbs: "",
    commodity: "",
    endingOdometer: "",
    loadedMiles: "",
    deadheadMiles: "0",
    grossRate: "",
    fuelCost: "",
    tolls: "",
    dispatchFee: "",
    factoringFee: "",
    otherExpenses: "",
    status: "PENDING",
    jurisdictionMiles: [],
    notes: "",
  };
}

function stateFromLoad(load: Load): FormState {
  return {
    truckId: load.truckId,
    driverId: load.driverId ?? "UNASSIGNED",
    date: load.date,
    deliveryDate: load.deliveryDate ?? "",
    originCity: load.originCity,
    originState: load.originState,
    destinationCity: load.destinationCity,
    destinationState: load.destinationState,
    broker: load.broker ?? "",
    loadNumber: load.loadNumber ?? "",
    equipmentType: load.equipmentType ?? "UNSPECIFIED",
    loadCapacity: load.loadCapacity ?? "UNSPECIFIED",
    equipmentLengthFt: load.equipmentLengthFt ? String(load.equipmentLengthFt) : "",
    weightLbs: load.weightLbs ? String(load.weightLbs) : "",
    commodity: load.commodity ?? "",
    endingOdometer: load.endingOdometer ? String(load.endingOdometer) : "",
    loadedMiles: String(load.loadedMiles),
    deadheadMiles: String(load.deadheadMiles),
    grossRate: String(load.grossRate),
    fuelCost: load.fuelCost ? String(load.fuelCost) : "",
    tolls: load.tolls ? String(load.tolls) : "",
    dispatchFee: load.dispatchFee ? String(load.dispatchFee) : "",
    factoringFee: load.factoringFee ? String(load.factoringFee) : "",
    otherExpenses: load.otherExpenses ? String(load.otherExpenses) : "",
    status: load.status,
    jurisdictionMiles: load.jurisdictionMiles.map((row, index) => ({
      id: `${row.jurisdiction}-${index}`,
      jurisdiction: row.jurisdiction,
      totalMiles: String(row.totalMiles),
      nonTaxableMiles: row.nonTaxableMiles ? String(row.nonTaxableMiles) : "",
    })),
    notes: load.notes ?? "",
  };
}

/**
 * Numbers carried over from somewhere else -- today, the load calculator
 * handing off a quote it just priced. Only used when adding, never when
 * editing an existing load.
 */
export interface LoadPrefill {
  loadedMiles?: number;
  deadheadMiles?: number;
  grossRate?: number;
  fuelCost?: number;
  tolls?: number;
  dispatchFee?: number;
  factoringFee?: number;
  otherExpenses?: number;
  broker?: string;
}

function applyPrefill(state: FormState, prefill?: LoadPrefill): FormState {
  if (!prefill) return state;
  const put = (value: number | undefined) =>
    value !== undefined && Number.isFinite(value) && value > 0 ? String(roundMoney(value)) : "";

  return {
    ...state,
    broker: prefill.broker ?? state.broker,
    loadedMiles: prefill.loadedMiles ? String(Math.round(prefill.loadedMiles)) : state.loadedMiles,
    deadheadMiles:
      prefill.deadheadMiles !== undefined
        ? String(Math.round(prefill.deadheadMiles))
        : state.deadheadMiles,
    grossRate: put(prefill.grossRate) || state.grossRate,
    fuelCost: put(prefill.fuelCost) || state.fuelCost,
    tolls: put(prefill.tolls) || state.tolls,
    dispatchFee: put(prefill.dispatchFee) || state.dispatchFee,
    factoringFee: put(prefill.factoringFee) || state.factoringFee,
    otherExpenses: put(prefill.otherExpenses) || state.otherExpenses,
  };
}

interface LoadFormDialogProps {
  load?: Load;
  brokers?: string[];
  trucks?: Truck[];
  drivers?: Driver[];
  /** Preselects the unit the page is currently scoped to. */
  defaultTruckId?: string | null;
  defaultDate?: string;
  ratingThresholds?: RatingThresholds;
  /** Existing dated assignments used only for a non-blocking availability warning. */
  driverSchedule?: DriverScheduleEntry[];
  trigger?: React.ReactNode;
  /** Seed values for a NEW load, e.g. handed over by the load calculator. */
  prefill?: LoadPrefill;
}

/**
 * Add / edit a load. Optimised for speed: date and status are prefilled,
 * every derived number updates as you type, and only six fields are
 * required to save.
 */
export function LoadFormDialog({
  load,
  brokers = [],
  trucks = [],
  drivers = [],
  defaultTruckId,
  defaultDate,
  ratingThresholds,
  driverSchedule = [],
  trigger,
  prefill,
}: LoadFormDialogProps) {
  const router = useRouter();
  const isEdit = Boolean(load);
  const prefillKey = JSON.stringify(prefill ?? null);

  /**
   * Which unit ran the load. A retired truck stays selectable only while an
   * existing load still points at it, so editing history never moves the
   * revenue onto a different unit.
   */
  const truckOptions = React.useMemo(
    () => orderedTrucks(trucks).filter((t) => t.active || t.id === load?.truckId),
    [trucks, load?.truckId],
  );
  // One truck ran it. Asking would be a question with a single answer.
  const showTruck = truckOptions.length > 1;
  const defaultTruck = defaultTruckId ?? truckOptions.find((t) => t.active)?.id ?? "";
  const driverOptions = React.useMemo(
    () => drivers.filter((driver) => driver.active || driver.id === load?.driverId),
    [drivers, load?.driverId],
  );

  const initial = React.useMemo(
    () =>
      load
        ? stateFromLoad(load)
        : applyPrefill(
            emptyState(defaultDate ?? todayISO(), defaultTruck),
            prefillKey === "null" ? undefined : (JSON.parse(prefillKey) as LoadPrefill),
          ),
    // Serialised so a freshly built prefill object on every keystroke does not
    // re-seed the form while the dialog is open.
    [load, defaultDate, defaultTruck, prefillKey],
  );

  const [open, setOpen] = React.useState(false);
  const [values, setValues] = React.useState<FormState>(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [attachments, setAttachments] = React.useState<PendingUpload[]>([]);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (open) {
      setValues(initial);
      setErrors({});
      setAttachments([]);
    }
  }, [open, initial]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const loadedMiles = toNumber(values.loadedMiles);
  const deadheadMiles = toNumber(values.deadheadMiles);
  const grossRate = toNumber(values.grossRate);
  const tripExpenses = roundMoney(
    toNumber(values.fuelCost) +
      toNumber(values.tolls) +
      toNumber(values.dispatchFee) +
      toNumber(values.factoringFee) +
      toNumber(values.otherExpenses) +
      (load?.driverPay ?? 0),
  );
  const totalMiles = loadedMiles + deadheadMiles;
  const tripProfit = roundMoney(grossRate - tripExpenses);
  const profitPerMile = div(tripProfit, totalMiles);
  const rating = rateLoad(profitPerMile, ratingThresholds);
  const assignedJurisdictionMiles = values.jurisdictionMiles.reduce(
    (total, row) => total + toNumber(row.totalMiles),
    0,
  );
  const scheduleConflicts = React.useMemo(
    () =>
      findDriverScheduleConflicts(driverSchedule, {
        loadId: load?.id,
        driverId: values.driverId === "UNASSIGNED" ? null : values.driverId,
        pickupDate: values.date,
        deliveryDate: values.deliveryDate || null,
      }),
    [driverSchedule, load?.id, values.driverId, values.date, values.deliveryDate],
  );
  const selectedDriver = driverOptions.find((driver) => driver.id === values.driverId);

  function submit(event: React.FormEvent) {
    event.preventDefault();

    const payload = {
      // Empty when the business has one truck: the store bills the unit that
      // exists rather than the form guessing at an id.
      truckId: values.truckId || null,
      driverId: values.driverId === "UNASSIGNED" ? null : values.driverId,
      date: values.date,
      deliveryDate: values.deliveryDate || null,
      originCity: values.originCity,
      originState: values.originState,
      destinationCity: values.destinationCity,
      destinationState: values.destinationState,
      broker: values.broker || null,
      loadNumber: values.loadNumber || null,
      equipmentType: values.equipmentType === "UNSPECIFIED" ? null : values.equipmentType,
      loadCapacity: values.loadCapacity === "UNSPECIFIED" ? null : values.loadCapacity,
      equipmentLengthFt: values.equipmentLengthFt
        ? Math.round(toNumber(values.equipmentLengthFt))
        : null,
      weightLbs: values.weightLbs ? Math.round(toNumber(values.weightLbs)) : null,
      commodity: values.commodity || null,
      endingOdometer: values.endingOdometer
        ? Math.round(toNumber(values.endingOdometer))
        : null,
      loadedMiles,
      deadheadMiles,
      grossRate,
      fuelCost: toNumber(values.fuelCost),
      tolls: toNumber(values.tolls),
      dispatchFee: toNumber(values.dispatchFee),
      factoringFee: toNumber(values.factoringFee),
      otherExpenses: toNumber(values.otherExpenses),
      costsPosted: true,
      status: values.status,
      jurisdictionMiles: values.jurisdictionMiles.map((row) => ({
        jurisdiction: row.jurisdiction,
        totalMiles: Math.round(toNumber(row.totalMiles)),
        nonTaxableMiles: Math.round(toNumber(row.nonTaxableMiles)),
      })),
      notes: values.notes || null,
    };

    const parsed = loadSchema.safeParse(payload);
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors(next);
      // A failure the user cannot see is a dead button: announce it, name the
      // fields, and move focus to the first one.
      toast.error(validationMessage(next, FIELD_LABELS));
      requestAnimationFrame(() => focusFirstError("load-form"));
      return;
    }

    setErrors({});
    startTransition(async () => {
      const result = isEdit
        ? await updateLoadAction(load!.id, payload)
        : await createLoadAction(payload);

      if (result.ok) {
        const upload = result.id
          ? await uploadPending("LOAD", result.id, attachments)
          : { uploaded: 0, failed: 0 };
        toast.success(isEdit ? "Load updated" : "Load added", {
          description:
            `${values.originCity} to ${values.destinationCity} - ${formatMoney(grossRate)}` +
            (upload.uploaded
              ? ` - ${upload.uploaded} document${upload.uploaded === 1 ? "" : "s"} attached`
              : ""),
        });
        if (upload.failed > 0) {
          toast.error(
            `${upload.failed} document${upload.failed === 1 ? "" : "s"} could not be attached. ` +
              `The load was saved -- add them from its detail page. ${upload.error ?? ""}`.trim(),
          );
        }
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
            Add Load
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit load" : "Add load"}</DialogTitle>
          <DialogDescription>
            Six required fields. Everything else is calculated for you.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <form id="load-form" onSubmit={submit} className="space-y-4" noValidate>
            {showTruck ? (
              <Field
                label="Truck"
                htmlFor="load-truck"
                required
                hint="The unit this load's revenue and miles belong to"
              >
                <Select value={values.truckId} onValueChange={(value) => set("truckId", value)}>
                  <SelectTrigger id="load-truck">
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

            {driverOptions.length > 0 ? (
              <Field
                label="Driver"
                htmlFor="load-driver"
                hint="The person whose pay statement this load belongs to"
              >
                <Select value={values.driverId} onValueChange={(value) => set("driverId", value)}>
                  <SelectTrigger id="load-driver">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
                    {driverOptions.map((driver) => (
                      <SelectItem key={driver.id} value={driver.id}>
                        {driver.name}{driver.active ? "" : " (inactive)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Pickup date" htmlFor="load-date" required error={errors.date}>
                <Input
                  id="load-date"
                  type="date"
                  value={values.date}
                  onChange={(e) => set("date", e.target.value)}
                  aria-invalid={Boolean(errors.date)}
                  required
                />
              </Field>
              <Field label="Delivery date" htmlFor="load-delivery-date" error={errors.deliveryDate}>
                <Input
                  id="load-delivery-date"
                  type="date"
                  min={values.date || undefined}
                  value={values.deliveryDate}
                  onChange={(e) => set("deliveryDate", e.target.value)}
                  aria-invalid={Boolean(errors.deliveryDate)}
                />
              </Field>
              <Field label="Status" htmlFor="load-status">
                <Select
                  value={values.status}
                  onValueChange={(value) => set("status", value as PaymentStatus)}
                >
                  <SelectTrigger id="load-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_STATUSES.map((status) => (
                      <SelectItem key={status.id} value={status.id}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Broker" htmlFor="load-broker" error={errors.broker}>
                <Input
                  id="load-broker"
                  list="broker-list"
                  maxLength={120}
                  aria-invalid={Boolean(errors.broker)}
                  value={values.broker}
                  onChange={(e) => set("broker", e.target.value)}
                  placeholder="Optional"
                />
                <datalist id="broker-list">
                  {brokers.map((broker) => (
                    <option key={broker} value={broker} />
                  ))}
                </datalist>
              </Field>
            </div>

            {scheduleConflicts.length > 0 ? (
              <div
                className="flex gap-3 rounded-lg border border-warn/35 bg-warn-subtle p-3"
                role="status"
                aria-live="polite"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {selectedDriver?.name ?? "This driver"} may already be scheduled
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    The selected pickup–delivery window overlaps another assignment. Dates do not
                    include hours, so review the existing load before continuing.
                  </p>
                  <div className="mt-2 divide-y divide-warn/20 rounded-md border border-warn/20 bg-background/45">
                    {scheduleConflicts.slice(0, 3).map((conflict) => {
                      const truckName =
                        trucks.find((truck) => truck.id === conflict.truckId)?.name ??
                        "Unknown truck";
                      const route = `${conflict.originCity}, ${conflict.originState} → ${conflict.destinationCity}, ${conflict.destinationState}`;
                      return (
                        <div
                          key={conflict.loadId}
                          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-foreground">
                              {conflict.loadNumber
                                ? `Load ${conflict.loadNumber}`
                                : "Existing load"}{" "}
                              · {truckName}
                            </p>
                            <p className="truncate text-2xs text-muted-foreground">
                              {formatDateShort(conflict.pickupDate)}
                              {conflict.deliveryDate
                                ? ` – ${formatDateShort(conflict.deliveryDate)}`
                                : ""}{" "}
                              · {route}
                            </p>
                          </div>
                          <Link
                            href={`/loads/${conflict.loadId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline focus-ring"
                          >
                            Review load
                            <ArrowUpRight className="size-3" aria-hidden />
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                  {scheduleConflicts.length > 3 ? (
                    <p className="mt-1.5 text-2xs font-medium text-warn">
                      +{scheduleConflicts.length - 3} more overlapping assignment
                      {scheduleConflicts.length - 3 === 1 ? "" : "s"}
                    </p>
                  ) : null}
                  <p className="mt-2 text-2xs font-medium text-foreground">
                    You can still save if the driver can complete both assignments without an
                    actual time conflict.
                  </p>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              <Field
                label="Origin city"
                htmlFor="load-origin-city"
                required
                error={errors.originCity}
                className="sm:col-span-2"
              >
                <Input
                  id="load-origin-city"
                  value={values.originCity}
                  onChange={(e) => set("originCity", e.target.value)}
                  placeholder="Herndon"
                  aria-invalid={Boolean(errors.originCity)}
                  required
                />
              </Field>
              <Field label="ST" htmlFor="load-origin-state" required error={errors.originState}>
                <Input
                  id="load-origin-state"
                  value={values.originState}
                  onChange={(e) => set("originState", e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="VA"
                  maxLength={2}
                  aria-invalid={Boolean(errors.originState)}
                  required
                />
              </Field>
              <Field
                label="Destination city"
                htmlFor="load-dest-city"
                required
                error={errors.destinationCity}
                className="sm:col-span-2"
              >
                <Input
                  id="load-dest-city"
                  value={values.destinationCity}
                  onChange={(e) => set("destinationCity", e.target.value)}
                  placeholder="Baltimore"
                  aria-invalid={Boolean(errors.destinationCity)}
                  required
                />
              </Field>
              <Field label="ST" htmlFor="load-dest-state" required error={errors.destinationState}>
                <Input
                  id="load-dest-state"
                  value={values.destinationState}
                  onChange={(e) =>
                    set("destinationState", e.target.value.toUpperCase().slice(0, 2))
                  }
                  placeholder="MD"
                  maxLength={2}
                  aria-invalid={Boolean(errors.destinationState)}
                  required
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              <Field label="Equipment" htmlFor="load-equipment" className="sm:col-span-2">
                <Select
                  value={values.equipmentType}
                  onValueChange={(value) => set("equipmentType", value as FormState["equipmentType"])}
                >
                  <SelectTrigger id="load-equipment">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNSPECIFIED">Not specified</SelectItem>
                    {EQUIPMENT_TYPES.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Load type" htmlFor="load-capacity">
                <Select
                  value={values.loadCapacity}
                  onValueChange={(value) => set("loadCapacity", value as FormState["loadCapacity"])}
                >
                  <SelectTrigger id="load-capacity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNSPECIFIED">Not specified</SelectItem>
                    {LOAD_CAPACITIES.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Length (ft)" htmlFor="load-length" error={errors.equipmentLengthFt}>
                <Input
                  id="load-length"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  step={1}
                  value={values.equipmentLengthFt}
                  onChange={(e) => set("equipmentLengthFt", e.target.value)}
                  aria-invalid={Boolean(errors.equipmentLengthFt)}
                  placeholder="26"
                />
              </Field>
              <Field label="Weight (lb)" htmlFor="load-weight" error={errors.weightLbs}>
                <Input
                  id="load-weight"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={200000}
                  step={1}
                  value={values.weightLbs}
                  onChange={(e) => set("weightLbs", e.target.value)}
                  aria-invalid={Boolean(errors.weightLbs)}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Commodity" htmlFor="load-commodity" error={errors.commodity}>
                <Input
                  id="load-commodity"
                  maxLength={120}
                  value={values.commodity}
                  onChange={(e) => set("commodity", e.target.value)}
                  aria-invalid={Boolean(errors.commodity)}
                  placeholder="General freight"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Field
                label="Loaded miles"
                htmlFor="load-loaded"
                required
                error={errors.loadedMiles}
              >
                <Input
                  id="load-loaded"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={values.loadedMiles}
                  onChange={(e) => set("loadedMiles", e.target.value)}
                  aria-invalid={Boolean(errors.loadedMiles)}
                  required
                />
              </Field>
              <Field
                label="Deadhead miles"
                htmlFor="load-deadhead"
                required
                error={errors.deadheadMiles}
              >
                <Input
                  id="load-deadhead"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={values.deadheadMiles}
                  onChange={(e) => set("deadheadMiles", e.target.value)}
                  aria-invalid={Boolean(errors.deadheadMiles)}
                  required
                />
              </Field>
              <Field
                label="Ending odometer"
                htmlFor="load-ending-odometer"
                error={errors.endingOdometer}
                hint="Actual dashboard reading"
              >
                <Input
                  id="load-ending-odometer"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={5_000_000}
                  step={1}
                  value={values.endingOdometer}
                  onChange={(e) => set("endingOdometer", e.target.value)}
                  aria-invalid={Boolean(errors.endingOdometer)}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Gross rate" htmlFor="load-rate" required error={errors.grossRate}>
                <Input
                  id="load-rate"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={values.grossRate}
                  onChange={(e) => set("grossRate", e.target.value)}
                  aria-invalid={Boolean(errors.grossRate)}
                  required
                />
              </Field>
              <Field label="Load number" htmlFor="load-number" error={errors.loadNumber}>
                <Input
                  id="load-number"
                  maxLength={60}
                  aria-invalid={Boolean(errors.loadNumber)}
                  value={values.loadNumber}
                  onChange={(e) => set("loadNumber", e.target.value)}
                  placeholder="Optional"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Field label="Trip fuel" htmlFor="load-fuel" error={errors.fuelCost}>
                <Input
                  id="load-fuel"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={values.fuelCost}
                  onChange={(e) => set("fuelCost", e.target.value)}
                  placeholder="0.00"
                />
              </Field>
              <Field label="Tolls" htmlFor="load-tolls" error={errors.tolls}>
                <Input
                  id="load-tolls"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={values.tolls}
                  onChange={(e) => set("tolls", e.target.value)}
                  placeholder="0.00"
                />
              </Field>
              <Field label="Dispatch" htmlFor="load-dispatch" error={errors.dispatchFee}>
                <Input
                  id="load-dispatch"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={values.dispatchFee}
                  onChange={(e) => set("dispatchFee", e.target.value)}
                  placeholder="0.00"
                />
              </Field>
              <Field label="Factoring" htmlFor="load-factoring" error={errors.factoringFee}>
                <Input
                  id="load-factoring"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={values.factoringFee}
                  onChange={(e) => set("factoringFee", e.target.value)}
                  placeholder="0.00"
                />
              </Field>
              <Field label="Other" htmlFor="load-other" error={errors.otherExpenses}>
                <Input
                  id="load-other"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={values.otherExpenses}
                  onChange={(e) => set("otherExpenses", e.target.value)}
                  placeholder="0.00"
                />
              </Field>
            </div>

            <p className="rounded-md border border-border bg-surface-sunken px-3 py-2.5 text-2xs leading-relaxed text-muted-foreground">
              Trip costs are included automatically in Operating Expenses. A detailed Fuel entry
              linked to this load replaces its fuel amount to prevent double counting.
            </p>

            <div className="space-y-2 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="label-xs">IFTA jurisdiction miles</p>
                  <p className="mt-1 text-2xs text-muted-foreground">
                    Enter actual route miles by jurisdiction. Unassigned miles remain visible in the quarterly report.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    set("jurisdictionMiles", [
                      ...values.jurisdictionMiles,
                      {
                        id: `ifta-${Date.now()}`,
                        jurisdiction: values.originState.toUpperCase() || "VA",
                        totalMiles: "",
                        nonTaxableMiles: "",
                      },
                    ])
                  }
                >
                  <Plus /> Add jurisdiction
                </Button>
              </div>
              {values.jurisdictionMiles.map((row) => (
                <div key={row.id} className="grid grid-cols-[7rem_1fr_1fr_auto] gap-2">
                  <Select
                    value={row.jurisdiction}
                    onValueChange={(jurisdiction) =>
                      set(
                        "jurisdictionMiles",
                        values.jurisdictionMiles.map((item) =>
                          item.id === row.id ? { ...item, jurisdiction } : item,
                        ),
                      )
                    }
                  >
                    <SelectTrigger aria-label="IFTA jurisdiction">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {IFTA_JURISDICTIONS.map((jurisdiction) => (
                        <SelectItem key={jurisdiction} value={jurisdiction}>
                          {jurisdiction}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    aria-label={`${row.jurisdiction} total miles`}
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Total miles"
                    value={row.totalMiles}
                    onChange={(event) =>
                      set(
                        "jurisdictionMiles",
                        values.jurisdictionMiles.map((item) =>
                          item.id === row.id ? { ...item, totalMiles: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  <Input
                    aria-label={`${row.jurisdiction} non-taxable miles`}
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Non-taxable"
                    value={row.nonTaxableMiles}
                    onChange={(event) =>
                      set(
                        "jurisdictionMiles",
                        values.jurisdictionMiles.map((item) =>
                          item.id === row.id
                            ? { ...item, nonTaxableMiles: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${row.jurisdiction} mileage`}
                    onClick={() =>
                      set(
                        "jurisdictionMiles",
                        values.jurisdictionMiles.filter((item) => item.id !== row.id),
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <p className="text-2xs text-muted-foreground tnum">
                Assigned {formatMiles(assignedJurisdictionMiles)} of {formatMiles(totalMiles)} trip miles.
              </p>
              {errors.jurisdictionMiles ? (
                <p className="text-2xs text-neg">{errors.jurisdictionMiles}</p>
              ) : null}
            </div>

            <Field label="Notes" htmlFor="load-notes" error={errors.notes}>
              <Textarea
                id="load-notes"
                maxLength={2000}
                aria-invalid={Boolean(errors.notes)}
                value={values.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Detention, lumper, appointment details..."
                rows={2}
              />
            </Field>

            {/* Live calculation strip -- the reason this form is fast. */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-border bg-surface-sunken px-3 py-2.5 sm:grid-cols-3">
              <Calc label="Total miles" value={formatMiles(totalMiles)} />
              <Calc label="$ / loaded mile" value={formatRateValue(div(grossRate, loadedMiles))} />
              <Calc label="$ / total mile" value={formatRateValue(div(grossRate, totalMiles))} />
              <Calc label="Direct Trip Costs" value={formatMoney(tripExpenses)} />
              <Calc
                label="Contribution Profit"
                value={formatMoney(tripProfit)}
                tone={tripProfit >= 0 ? "pos" : "neg"}
              />
              <Calc
                label="Contribution Profit / mile"
                value={formatRateValue(profitPerMile)}
                tone={tripProfit >= 0 ? "pos" : "neg"}
              />
            </div>

            {grossRate > 0 && totalMiles > 0 ? (
              <RatingPreview rating={rating} profitPerMile={profitPerMile} />
            ) : null}

            <div className="space-y-2 border-t border-border pt-3">
              <p className="label-xs">Documents</p>
              {isEdit ? (
                <p className="text-2xs text-muted-foreground">
                  Rate confirmations, BOLs and PODs are managed on the load detail page.
                </p>
              ) : (
                <DocumentUploader
                  owner="LOAD"
                  pending={attachments}
                  onPendingChange={setAttachments}
                  compact
                />
              )}
            </div>
          </form>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="load-form" size="sm" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {isEdit ? "Save changes" : "Add load"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Calc({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:block">
      <span className="label-xs">{label}</span>
      <span
        className={`block tnum text-sm font-semibold sm:mt-0.5 ${
          tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function RatingPreview({
  rating,
  profitPerMile,
}: {
  rating: ReturnType<typeof rateLoad>;
  profitPerMile: number;
}) {
  const tone = {
    GREAT: "border-pos/40 bg-pos-soft text-pos",
    GOOD: "border-info/40 bg-info-soft text-info",
    MARGINAL: "border-warn/40 bg-warn-soft text-warn",
    BAD: "border-neg/40 bg-neg-soft text-neg",
  }[rating];

  return (
    <div className={`flex items-baseline justify-between rounded-md border px-3 py-2 ${tone}`}>
      <span className="text-sm font-semibold tracking-wide">{rating} LOAD</span>
      <span className="tnum text-sm font-semibold">
        {formatRateValue(profitPerMile)}/mi profit
      </span>
    </div>
  );
}
