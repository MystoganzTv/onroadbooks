"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";
import { ViewModeToggle } from "@/components/shared/view-mode";
import { useViewMode } from "@/components/shell/view-mode-provider";
import { FormSection } from "@/components/shared/form-section";
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
import { div, roundMoney, type RatingThresholds } from "@/lib/calculations";
import { formatMiles, formatMoney, formatPercent, formatRateValue } from "@/lib/formatters";
import { interpolate } from "@/lib/i18n/dictionaries";
import {
  exactPercentOfRate,
  feeFromPercent,
  percentOfRate,
  type FeeDefaults,
  type FeeMode,
} from "@/lib/load-fees";
import { loadSchema } from "@/lib/schemas";
import { todayISO } from "@/lib/periods";
import { orderedTrucks } from "@/lib/fleet";
import { IFTA_JURISDICTIONS } from "@/lib/ifta";
import { EQUIPMENT_TYPES, LOAD_CAPACITIES } from "@/lib/load-details";
import type { Driver, EquipmentType, Load, LoadCapacity, Truck } from "@/lib/types";
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
  /** What the owner typed: a percent of the rate or dollars, per the mode. */
  dispatchFee: string;
  dispatchMode: FeeMode;
  factoringFee: string;
  factoringMode: FeeMode;
  otherExpenses: string;
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
    dispatchMode: "pct",
    factoringFee: "",
    factoringMode: "pct",
    otherExpenses: "",
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
    ...feeState("dispatch", load.dispatchFee, load.grossRate),
    ...feeState("factoring", load.factoringFee, load.grossRate),
    otherExpenses: load.otherExpenses ? String(load.otherExpenses) : "",
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
 * Values carried over from somewhere else -- the load calculator handing off
 * a quote it just priced, or a rate confirmation we just read. Only used when
 * adding, never when editing an existing load.
 *
 * A prefill is a starting point, not a saved value: every field lands in the
 * ordinary form, editable, and nothing reaches the ledger until the owner
 * presses save.
 */
export interface LoadPrefill {
  date?: string;
  deliveryDate?: string;
  originCity?: string;
  originState?: string;
  destinationCity?: string;
  destinationState?: string;
  broker?: string;
  loadNumber?: string;
  equipmentType?: EquipmentType;
  equipmentLengthFt?: number;
  weightLbs?: number;
  commodity?: string;
  loadedMiles?: number;
  deadheadMiles?: number;
  grossRate?: number;
  fuelCost?: number;
  tolls?: number;
  dispatchFee?: number;
  factoringFee?: number;
  otherExpenses?: number;
}

function applyPrefill(state: FormState, prefill?: LoadPrefill): FormState {
  if (!prefill) return state;
  const put = (value: number | undefined) =>
    value !== undefined && Number.isFinite(value) && value > 0 ? String(roundMoney(value)) : "";
  const whole = (value: number | undefined) =>
    value !== undefined && Number.isFinite(value) && value > 0 ? String(Math.round(value)) : "";

  const grossRate = put(prefill.grossRate) || state.grossRate;
  const given = (value: number | undefined): value is number =>
    value !== undefined && Number.isFinite(value) && value > 0;

  return {
    ...state,
    date: prefill.date || state.date,
    deliveryDate: prefill.deliveryDate ?? state.deliveryDate,
    originCity: prefill.originCity ?? state.originCity,
    originState: prefill.originState ?? state.originState,
    destinationCity: prefill.destinationCity ?? state.destinationCity,
    destinationState: prefill.destinationState ?? state.destinationState,
    broker: prefill.broker ?? state.broker,
    loadNumber: prefill.loadNumber ?? state.loadNumber,
    equipmentType: prefill.equipmentType ?? state.equipmentType,
    equipmentLengthFt: whole(prefill.equipmentLengthFt) || state.equipmentLengthFt,
    weightLbs: whole(prefill.weightLbs) || state.weightLbs,
    commodity: prefill.commodity ?? state.commodity,
    loadedMiles: prefill.loadedMiles ? String(Math.round(prefill.loadedMiles)) : state.loadedMiles,
    deadheadMiles:
      prefill.deadheadMiles !== undefined
        ? String(Math.round(prefill.deadheadMiles))
        : state.deadheadMiles,
    grossRate,
    fuelCost: put(prefill.fuelCost) || state.fuelCost,
    tolls: put(prefill.tolls) || state.tolls,
    ...(given(prefill.dispatchFee) ? feeState("dispatch", prefill.dispatchFee, toNumber(grossRate)) : {}),
    ...(given(prefill.factoringFee) ? feeState("factoring", prefill.factoringFee, toNumber(grossRate)) : {}),
    otherExpenses: put(prefill.otherExpenses) || state.otherExpenses,
  };
}

/**
 * A stored fee shown the way it was most likely entered: as a percent when a
 * clean percentage of the rate reproduces it to the cent, otherwise dollars.
 */
function feeInput(fee: number, grossRate: number): { value: string; mode: FeeMode } {
  const pct = exactPercentOfRate(fee, grossRate);
  if (pct !== null) return { value: String(pct), mode: "pct" };
  if (fee > 0) return { value: String(roundMoney(fee)), mode: "amount" };
  return { value: "", mode: "pct" };
}

function feeState(kind: "dispatch", fee: number, grossRate: number): Pick<FormState, "dispatchFee" | "dispatchMode">;
function feeState(kind: "factoring", fee: number, grossRate: number): Pick<FormState, "factoringFee" | "factoringMode">;
function feeState(kind: "dispatch" | "factoring", fee: number, grossRate: number) {
  const { value, mode } = feeInput(fee, grossRate);
  return kind === "dispatch"
    ? { dispatchFee: value, dispatchMode: mode }
    : { factoringFee: value, factoringMode: mode };
}

/** A new load starts at the rates the owner used on their latest load. */
function withFeeDefaults(state: FormState, defaults?: FeeDefaults): FormState {
  if (!defaults) return state;
  return {
    ...state,
    dispatchFee: defaults.dispatchPct ? String(defaults.dispatchPct) : state.dispatchFee,
    dispatchMode: defaults.dispatchPct ? "pct" : state.dispatchMode,
    factoringFee: defaults.factoringPct ? String(defaults.factoringPct) : state.factoringFee,
    factoringMode: defaults.factoringPct ? "pct" : state.factoringMode,
  };
}

function feeAmount(input: string, mode: FeeMode, grossRate: number): number {
  return mode === "pct" ? feeFromPercent(grossRate, toNumber(input)) : roundMoney(toNumber(input));
}

function percentLabel(pct: number): string {
  return formatPercent(pct, Number.isInteger(pct) ? 0 : Number.isInteger(pct * 10) ? 1 : 2);
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
  /** Dispatch / factoring percentages a NEW load starts with. */
  feeDefaults?: FeeDefaults;
  /** Pass `null` for a form opened from elsewhere, with no button of its own. */
  trigger?: React.ReactNode;
  /** Seed values for a NEW load, e.g. handed over by the load calculator. */
  prefill?: LoadPrefill;
  /** Files staged for a NEW load, e.g. the rate confirmation it was read from. */
  initialAttachments?: PendingUpload[];
  /** Controlled open state, for a flow that hands off from another dialog. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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
  feeDefaults,
  trigger,
  prefill,
  initialAttachments,
  open: openProp,
  onOpenChange,
}: LoadFormDialogProps) {
  const router = useRouter();
  const { locale, dictionary } = useLanguage();
  const { mode } = useViewMode();
  const simple = mode === "simple";
  const copy = dictionary.loads;
  const isEdit = Boolean(load);
  const prefillKey = JSON.stringify(prefill ?? null);
  const feeDefaultsKey = JSON.stringify(feeDefaults ?? null);

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
            withFeeDefaults(
              emptyState(defaultDate ?? todayISO(), defaultTruck),
              (JSON.parse(feeDefaultsKey) as FeeDefaults | null) ?? undefined,
            ),
            prefillKey === "null" ? undefined : (JSON.parse(prefillKey) as LoadPrefill),
          ),
    // Serialised so a freshly built prefill object on every keystroke does not
    // re-seed the form while the dialog is open.
    [load, defaultDate, defaultTruck, prefillKey, feeDefaultsKey],
  );

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (openProp === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [openProp, onOpenChange],
  );
  // Read through a ref, synced in its own effect declared before the reset
  // below so it is current when that one runs: a caller building this array
  // inline would otherwise re-seed the form on every render while open.
  const initialAttachmentsRef = React.useRef(initialAttachments);
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
    initialAttachmentsRef.current = initialAttachments;
  }, [initialAttachments]);

  const initialKey = JSON.stringify(initial);
  React.useEffect(() => {
    if (open) {
      setValues(JSON.parse(initialKey) as FormState);
      setErrors({});
      setAttachments(initialAttachmentsRef.current ?? []);
      setLocationOverrides({ origin: false, destination: false });
    }
  }, [open, initialKey]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const showIfta = truckOptions.find((truck) => truck.id === values.truckId)?.iftaReportingEnabled === true;

  const loadedMiles = toNumber(values.loadedMiles);
  const deadheadMiles = toNumber(values.deadheadMiles);
  const grossRate = toNumber(values.grossRate);
  const totalMiles = loadedMiles + deadheadMiles;
  const dispatchAmount = feeAmount(values.dispatchFee, values.dispatchMode, grossRate);
  const factoringAmount = feeAmount(values.factoringFee, values.factoringMode, grossRate);
  const assignedJurisdictionMiles = values.jurisdictionMiles.reduce(
    (total, row) => total + toNumber(row.totalMiles),
    0,
  );

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
      dispatchFee: dispatchAmount,
      factoringFee: factoringAmount,
      otherExpenses: toNumber(values.otherExpenses),
      costsPosted: load?.costsPosted ?? true,
      // Preserve legacy metadata. Reporting a load already records its income.
      status: load?.status ?? "PENDING",
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

    const percentErrors: Record<string, string> = {};
    for (const [field, mode] of [["dispatchFee", values.dispatchMode], ["factoringFee", values.factoringMode]] as const) {
      const pct = toNumber(values[field]);
      if (mode === "pct" && (pct < 0 || pct > 100)) percentErrors[field] = copy.feePercentRange;
    }
    if (Object.keys(percentErrors).length > 0) {
      setErrors(percentErrors);
      toast.error(copy.feePercentRange);
      requestAnimationFrame(() => focusFirstError("load-form"));
      return;
    }

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
        requestAnimationFrame(() => focusFirstError("load-form"));
        toast.error(localizedClientError(result.error));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== null && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button size="sm">
              <Plus />
              {copy.addLoad}
            </Button>
          )}
        </DialogTrigger>
      )}

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? copy.editLoad : copy.addLoad}
          </DialogTitle>
          <DialogDescription>
            {copy.formDescription}
          </DialogDescription>
          <ViewModeToggle />
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

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FeeField
                id="load-dispatch"
                label={copy.dispatch}
                value={values.dispatchFee}
                mode={values.dispatchMode}
                grossRate={grossRate}
                amount={dispatchAmount}
                error={errors.dispatchFee}
                onValueChange={(value) => set("dispatchFee", value)}
                onModeChange={(mode) => setValues((prev) => ({
                  ...prev,
                  dispatchMode: mode,
                  dispatchFee: convertFee(prev.dispatchFee, prev.dispatchMode, mode, grossRate),
                }))}
              />
              <FeeField
                id="load-factoring"
                label={copy.factoring}
                value={values.factoringFee}
                mode={values.factoringMode}
                grossRate={grossRate}
                amount={factoringAmount}
                error={errors.factoringFee}
                onValueChange={(value) => set("factoringFee", value)}
                onModeChange={(mode) => setValues((prev) => ({
                  ...prev,
                  factoringMode: mode,
                  factoringFee: convertFee(prev.factoringFee, prev.factoringMode, mode, grossRate),
                }))}
              />
            </div>
            {/* Live calculation strip -- the reason this form is fast. */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-border bg-surface-sunken px-3 py-2.5 sm:grid-cols-3">
              <Calc label={copy.totalMiles} value={formatMiles(totalMiles)} />
              {!simple && <Calc label={copy.perLoaded} value={formatRateValue(div(grossRate, loadedMiles))} />}
              {!simple && <Calc label={copy.perTotal} value={formatRateValue(div(grossRate, totalMiles))} />}
            </div>

            <FormSection title={dictionary.viewMode.loadDetails} expanded={!simple}>
            <div className="grid grid-cols-2 gap-3">
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

            </FormSection>

            {showIfta ? <FormSection title={copy.iftaMiles} expanded={!simple}>
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
                <p className="text-2xs text-neg" data-error-anchor tabIndex={-1} role="alert">{errors.jurisdictionMiles}</p>
              ) : null}
            </div>

            </FormSection> : null}

            {/* Open whenever something is attached, e.g. the rate confirmation
                the form was read from, so the owner sees it will be filed. */}
            {!isEdit ? <FormSection title={copy.documents} expanded={!simple || attachments.length > 0}>
              <DocumentUploader
                owner="LOAD"
                pending={attachments}
                onPendingChange={setAttachments}
                compact
              />
            </FormSection> : null}

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

/** Re-expresses what was typed when the owner flips between % and $. */
function convertFee(input: string, from: FeeMode, to: FeeMode, grossRate: number): string {
  if (from === to || !input.trim()) return input;
  const amount = feeAmount(input, from, grossRate);
  if (to === "amount") return amount > 0 ? String(amount) : "";
  const pct = percentOfRate(amount, grossRate);
  return pct ? String(pct) : "";
}

function FeeField({
  id,
  label,
  value,
  mode,
  grossRate,
  amount,
  error,
  onValueChange,
  onModeChange,
}: {
  id: string;
  label: string;
  value: string;
  mode: FeeMode;
  grossRate: number;
  amount: number;
  error?: string;
  onValueChange: (value: string) => void;
  onModeChange: (mode: FeeMode) => void;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.loads;
  const pct = percentOfRate(amount, grossRate);
  // Nothing to show until there is a rate to take the fee from.
  const hint = toNumber(value) > 0 && grossRate > 0
    ? mode === "pct"
      ? interpolate(copy.feeIsAmount, { amount: formatMoney(amount) })
      : pct !== null ? interpolate(copy.feeIsPercent, { pct: percentLabel(pct) }) : undefined
    : undefined;

  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      <div className="flex gap-1.5">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          max={mode === "pct" ? 100 : undefined}
          step="0.01"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          aria-invalid={Boolean(error)}
          placeholder="0"
          className="min-w-0 flex-1"
        />
        <div
          role="group"
          aria-label={label}
          className="flex shrink-0 overflow-hidden rounded-md border border-border"
        >
          {(["pct", "amount"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              aria-label={interpolate(option === "pct" ? copy.feeAsPercent : copy.feeAsAmount, { fee: label })}
              onClick={() => onModeChange(option)}
              className={`min-w-9 px-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                mode === option
                  ? "bg-foreground text-background"
                  : "bg-transparent text-muted-foreground hover:bg-surface-sunken"
              }`}
            >
              {option === "pct" ? "%" : "$"}
            </button>
          ))}
        </div>
      </div>
    </Field>
  );
}
