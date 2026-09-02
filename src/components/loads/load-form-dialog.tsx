"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowUpRight, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";
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
import { formatMiles, formatMoney, formatRateValue } from "@/lib/formatters";
import { formatLocaleDate } from "@/lib/i18n-format";
import { interpolate } from "@/lib/i18n/dictionaries";
import { loadSchema } from "@/lib/schemas";
import { todayISO } from "@/lib/periods";
import { orderedTrucks } from "@/lib/fleet";
import { IFTA_JURISDICTIONS } from "@/lib/ifta";
import { EQUIPMENT_TYPES, LOAD_CAPACITIES } from "@/lib/load-details";
import type { Driver, EquipmentType, Load, LoadCapacity, PaymentStatus, Truck } from "@/lib/types";
import { toNumber } from "@/lib/utils";
import { LocationFields } from "./location-fields";

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
  const { locale, dictionary } = useLanguage();
  const copy = dictionary.loads;
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
  const [locationOverrides, setLocationOverrides] = React.useState({
    origin: false,
    destination: false,
  });
  const [pending, startTransition] = React.useTransition();

  const setOriginLocationOverride = React.useCallback((value: boolean) => {
    setLocationOverrides((current) => ({ ...current, origin: value }));
  }, []);
  const setDestinationLocationOverride = React.useCallback((value: boolean) => {
    setLocationOverrides((current) => ({ ...current, destination: value }));
  }, []);

  React.useEffect(() => {
    if (open) {
      setValues(initial);
      setErrors({});
      setAttachments([]);
      setLocationOverrides({ origin: false, destination: false });
    }
  }, [open, initial]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

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
      // Deliberate escape hatch for a legitimate place missing from the local
      // database. Server actions independently verify both pairs before they
      // honour these acknowledgements.
      locationOverrides,
    };

    const parsed = loadSchema.safeParse(payload);
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors(next);
      // A failure the user cannot see is a dead button: announce it, name the
      // fields, and move focus to the first one.
      const fieldLabels = locale === "es" ? {
        ...FIELD_LABELS,
        broker: copy.broker, loadNumber: copy.loadNumberLabel, notes: copy.notes,
        deliveryDate: copy.deliveryDate, endingOdometer: copy.endingOdometer,
        originCity: copy.originCity, destinationCity: copy.destinationCity,
        loadedMiles: copy.loadedMiles, deadheadMiles: copy.deadheadMiles,
        grossRate: copy.grossRate, fuelCost: copy.tripFuel, tolls: copy.tolls,
        dispatchFee: copy.dispatch, factoringFee: copy.factoring, otherExpenses: copy.other,
        date: copy.pickupDate, equipmentLengthFt: copy.lengthFeet, weightLbs: copy.weight, commodity: copy.commodity,
      } : FIELD_LABELS;
      toast.error(validationMessage(next, fieldLabels));
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
        toast.success(isEdit ? copy.updated : copy.added, {
          description:
            `${values.originCity} ${copy.to} ${values.destinationCity} - ${formatMoney(grossRate)}` +
            (upload.uploaded
              ? ` - ${interpolate(copy.attachedDocuments, { count: upload.uploaded, unit: upload.uploaded === 1 ? copy.document : copy.documentsPlural })}`
              : ""),
        });
        if (upload.failed > 0) {
          toast.error(interpolate(copy.uploadFailed, {
            count: upload.failed,
            unit: upload.failed === 1 ? copy.document : copy.documentsPlural,
            error: upload.error ?? "",
          }).trim());
        }
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
            {copy.addLoad}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? copy.editLoad : copy.addLoad}
          </DialogTitle>
          <DialogDescription>
            {copy.formDescription}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <form id="load-form" onSubmit={submit} className="space-y-4" noValidate>
            {showTruck ? (
              <Field
                label={copy.truck}
                htmlFor="load-truck"
                required
                hint={copy.truckHint}
              >
                <Select value={values.truckId} onValueChange={(value) => set("truckId", value)}>
                  <SelectTrigger id="load-truck">
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

            {driverOptions.length > 0 ? (
              <Field
                label={copy.driver}
                htmlFor="load-driver"
                hint={copy.driverHint}
              >
                <Select value={values.driverId} onValueChange={(value) => set("driverId", value)}>
                  <SelectTrigger id="load-driver">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNASSIGNED">{copy.unassigned}</SelectItem>
                    {driverOptions.map((driver) => (
                      <SelectItem key={driver.id} value={driver.id}>
                        {driver.name}{driver.active ? "" : ` (${copy.inactive})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label={copy.pickupDate} htmlFor="load-date" required error={errors.date}>
                <Input
                  id="load-date"
                  type="date"
                  value={values.date}
                  onChange={(e) => set("date", e.target.value)}
                  aria-invalid={Boolean(errors.date)}
                  required
                />
              </Field>
              <Field label={copy.deliveryDate} htmlFor="load-delivery-date" error={errors.deliveryDate}>
                <Input
                  id="load-delivery-date"
                  type="date"
                  min={values.date || undefined}
                  value={values.deliveryDate}
                  onChange={(e) => set("deliveryDate", e.target.value)}
                  aria-invalid={Boolean(errors.deliveryDate)}
                />
              </Field>
              <Field label={copy.status} htmlFor="load-status">
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
                        {status.id === "PAID" ? copy.paid : status.id === "INVOICED" ? copy.invoiced : copy.pending}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={copy.broker} htmlFor="load-broker" error={errors.broker}>
                <Input
                  id="load-broker"
                  list="broker-list"
                  maxLength={120}
                  aria-invalid={Boolean(errors.broker)}
                  value={values.broker}
                  onChange={(e) => set("broker", e.target.value)}
                  placeholder={copy.optional}
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
                className="flex gap-3 rounded-lg border border-warn/35 bg-warn-soft/45 p-3"
                role="status"
                aria-live="polite"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {interpolate(copy.driverConflict, { driver: selectedDriver?.name ?? copy.thisDriver })}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {copy.conflictDescription}
                  </p>
                  <div className="mt-2 divide-y divide-warn/20 rounded-md border border-warn/20 bg-background/45">
                    {scheduleConflicts.slice(0, 3).map((conflict) => {
                      const truckName =
                        trucks.find((truck) => truck.id === conflict.truckId)?.name ??
                        copy.unknownTruck;
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
                                : copy.existingLoad}{" "}
                              · {truckName}
                            </p>
                            <p className="truncate text-2xs text-muted-foreground">
                              {formatLocaleDate(conflict.pickupDate, locale, "short")}
                              {conflict.deliveryDate
                                ? ` – ${formatLocaleDate(conflict.deliveryDate, locale, "short")}`
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
                            {copy.reviewLoad}
                            <ArrowUpRight className="size-3" aria-hidden />
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                  {scheduleConflicts.length > 3 ? (
                    <p className="mt-1.5 text-2xs font-medium text-warn">
                      {interpolate(copy.moreConflicts, { count: scheduleConflicts.length - 3, unit: scheduleConflicts.length - 3 === 1 ? copy.assignment : copy.assignments })}
                    </p>
                  ) : null}
                  <p className="mt-2 text-2xs font-medium text-foreground">
                    {copy.conflictAllowed}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              <LocationFields
                id="load-origin"
                label={copy.originCity}
                city={values.originCity}
                state={values.originState}
                cityError={errors.originCity}
                stateError={errors.originState}
                enabled={open}
                manualConfirmed={locationOverrides.origin}
                onCityChange={(value) => set("originCity", value)}
                onStateChange={(value) => set("originState", value)}
                onManualConfirmedChange={setOriginLocationOverride}
              />
              <LocationFields
                id="load-destination"
                label={copy.destinationCity}
                city={values.destinationCity}
                state={values.destinationState}
                cityError={errors.destinationCity}
                stateError={errors.destinationState}
                enabled={open}
                manualConfirmed={locationOverrides.destination}
                onCityChange={(value) => set("destinationCity", value)}
                onStateChange={(value) => set("destinationState", value)}
                onManualConfirmedChange={setDestinationLocationOverride}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              <Field label={copy.equipment} htmlFor="load-equipment" className="sm:col-span-2">
                <Select
                  value={values.equipmentType}
                  onValueChange={(value) => set("equipmentType", value as FormState["equipmentType"])}
                >
                  <SelectTrigger id="load-equipment">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNSPECIFIED">{copy.notSpecified}</SelectItem>
                    {EQUIPMENT_TYPES.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {locale === "es" ? option.labelEs : option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={copy.loadType} htmlFor="load-capacity">
                <Select
                  value={values.loadCapacity}
                  onValueChange={(value) => set("loadCapacity", value as FormState["loadCapacity"])}
                >
                  <SelectTrigger id="load-capacity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNSPECIFIED">{copy.notSpecified}</SelectItem>
                    {LOAD_CAPACITIES.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {locale === "es" ? option.labelEs : option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={copy.lengthFeet} htmlFor="load-length" error={errors.equipmentLengthFt}>
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
              <Field label={copy.weightPounds} htmlFor="load-weight" error={errors.weightLbs}>
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
                  placeholder={copy.optional}
                />
              </Field>
              <Field label={copy.commodity} htmlFor="load-commodity" error={errors.commodity}>
                <Input
                  id="load-commodity"
                  maxLength={120}
                  value={values.commodity}
                  onChange={(e) => set("commodity", e.target.value)}
                  aria-invalid={Boolean(errors.commodity)}
                  placeholder={copy.generalFreight}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Field
                label={copy.loadedMiles}
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
                label={copy.deadheadMiles}
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
                label={copy.endingOdometer}
                htmlFor="load-ending-odometer"
                error={errors.endingOdometer}
                hint={copy.actualDashboard}
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
                  placeholder={copy.optional}
                />
              </Field>
              <Field label={copy.grossRate} htmlFor="load-rate" required error={errors.grossRate}>
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
              <Field label={copy.loadNumberLabel} htmlFor="load-number" error={errors.loadNumber}>
                <Input
                  id="load-number"
                  maxLength={60}
                  aria-invalid={Boolean(errors.loadNumber)}
                  value={values.loadNumber}
                  onChange={(e) => set("loadNumber", e.target.value)}
                  placeholder={copy.optional}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Field label={copy.tripFuel} htmlFor="load-fuel" error={errors.fuelCost}>
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
              <Field label={copy.tolls} htmlFor="load-tolls" error={errors.tolls}>
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
              <Field label={copy.dispatch} htmlFor="load-dispatch" error={errors.dispatchFee}>
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
              <Field label={copy.factoring} htmlFor="load-factoring" error={errors.factoringFee}>
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
              <Field label={copy.other} htmlFor="load-other" error={errors.otherExpenses}>
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
              {copy.costsAutomatic}
            </p>

            <div className="space-y-2 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="label-xs">{copy.iftaMiles}</p>
                  <p className="mt-1 text-2xs text-muted-foreground">
                    {copy.iftaDescription}
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
                  <Plus /> {copy.addJurisdiction}
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
                    <SelectTrigger aria-label={copy.iftaJurisdiction}>
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
                    placeholder={copy.totalMiles}
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
                    placeholder={copy.nonTaxable}
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
                    aria-label={interpolate(copy.removeMileage, { jurisdiction: row.jurisdiction })}
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
                {interpolate(copy.assignedMiles, { assigned: formatMiles(assignedJurisdictionMiles), total: formatMiles(totalMiles) })}
              </p>
              {errors.jurisdictionMiles ? (
                <p className="text-2xs text-neg">{errors.jurisdictionMiles}</p>
              ) : null}
            </div>

            <Field label={copy.notes} htmlFor="load-notes" error={errors.notes}>
              <Textarea
                id="load-notes"
                maxLength={2000}
                aria-invalid={Boolean(errors.notes)}
                value={values.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder={copy.notesPlaceholder}
                rows={2}
              />
            </Field>

            {/* Live calculation strip -- the reason this form is fast. */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-border bg-surface-sunken px-3 py-2.5 sm:grid-cols-3">
              <Calc label={copy.totalMiles} value={formatMiles(totalMiles)} />
              <Calc label={copy.perLoaded} value={formatRateValue(div(grossRate, loadedMiles))} />
              <Calc label={copy.perTotal} value={formatRateValue(div(grossRate, totalMiles))} />
              <Calc label={copy.directTripCosts} value={formatMoney(tripExpenses)} />
              <Calc
                label={copy.contributionProfit}
                value={formatMoney(tripProfit)}
                tone={tripProfit >= 0 ? "pos" : "neg"}
              />
              <Calc
                label={copy.contributionPerMile}
                value={formatRateValue(profitPerMile)}
                tone={tripProfit >= 0 ? "pos" : "neg"}
              />
            </div>

            {grossRate > 0 && totalMiles > 0 ? (
              <RatingPreview rating={rating} profitPerMile={profitPerMile} />
            ) : null}

            <div className="space-y-2 border-t border-border pt-3">
              <p className="label-xs">{copy.documents}</p>
              {isEdit ? (
                <p className="text-2xs text-muted-foreground">
                  {copy.documentsDescription}
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
            {dictionary.common.cancel}
          </Button>
          <Button type="submit" form="load-form" size="sm" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {isEdit ? copy.saveChanges : copy.addLoad}
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
  const { dictionary } = useLanguage();
  const copy = dictionary.loads;
  const tone = {
    GREAT: "border-pos/40 bg-pos-soft text-pos",
    GOOD: "border-info/40 bg-info-soft text-info",
    MARGINAL: "border-warn/40 bg-warn-soft text-warn",
    BAD: "border-neg/40 bg-neg-soft text-neg",
  }[rating];

  return (
    <div className={`flex items-baseline justify-between rounded-md border px-3 py-2 ${tone}`}>
      <span className="text-sm font-semibold tracking-wide">
        {rating === "GREAT" ? copy.greatLoad : rating === "GOOD" ? copy.goodLoad : rating === "MARGINAL" ? copy.marginalLoad : copy.badLoad}
      </span>
      <span className="tnum text-sm font-semibold">
        {formatRateValue(profitPerMile)}/mi · {copy.profitPerMile}
      </span>
    </div>
  );
}
