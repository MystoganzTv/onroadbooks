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
import {
  DocumentUploader,
  uploadPending,
  type PendingUpload,
} from "@/components/documents/document-uploader";
import { createLoadAction, updateLoadAction } from "@/lib/actions/loads";
import { div, rateLoad, roundMoney, type RatingThresholds } from "@/lib/calculations";
import { PAYMENT_STATUSES } from "@/lib/categories";
import { formatMiles, formatMoney, formatRateValue } from "@/lib/formatters";
import { loadSchema } from "@/lib/schemas";
import { todayISO } from "@/lib/periods";
import type { Load, PaymentStatus } from "@/lib/types";
import { toNumber } from "@/lib/utils";

const FIELD_LABELS: Record<string, string> = {
  broker: "Broker",
  loadNumber: "Load number",
  notes: "Notes",
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
  date: "Date",
};

interface FormState {
  date: string;
  originCity: string;
  originState: string;
  destinationCity: string;
  destinationState: string;
  broker: string;
  loadNumber: string;
  loadedMiles: string;
  deadheadMiles: string;
  grossRate: string;
  fuelCost: string;
  tolls: string;
  dispatchFee: string;
  factoringFee: string;
  otherExpenses: string;
  status: PaymentStatus;
  notes: string;
}

function emptyState(defaultDate: string): FormState {
  return {
    date: defaultDate,
    originCity: "",
    originState: "",
    destinationCity: "",
    destinationState: "",
    broker: "",
    loadNumber: "",
    loadedMiles: "",
    deadheadMiles: "0",
    grossRate: "",
    fuelCost: "",
    tolls: "",
    dispatchFee: "",
    factoringFee: "",
    otherExpenses: "",
    status: "PENDING",
    notes: "",
  };
}

function stateFromLoad(load: Load): FormState {
  return {
    date: load.date,
    originCity: load.originCity,
    originState: load.originState,
    destinationCity: load.destinationCity,
    destinationState: load.destinationState,
    broker: load.broker ?? "",
    loadNumber: load.loadNumber ?? "",
    loadedMiles: String(load.loadedMiles),
    deadheadMiles: String(load.deadheadMiles),
    grossRate: String(load.grossRate),
    fuelCost: load.fuelCost ? String(load.fuelCost) : "",
    tolls: load.tolls ? String(load.tolls) : "",
    dispatchFee: load.dispatchFee ? String(load.dispatchFee) : "",
    factoringFee: load.factoringFee ? String(load.factoringFee) : "",
    otherExpenses: load.otherExpenses ? String(load.otherExpenses) : "",
    status: load.status,
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
  defaultDate?: string;
  ratingThresholds?: RatingThresholds;
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
  defaultDate,
  ratingThresholds,
  trigger,
  prefill,
}: LoadFormDialogProps) {
  const router = useRouter();
  const isEdit = Boolean(load);
  const prefillKey = JSON.stringify(prefill ?? null);
  const initial = React.useMemo(
    () =>
      load
        ? stateFromLoad(load)
        : applyPrefill(
            emptyState(defaultDate ?? todayISO()),
            prefillKey === "null" ? undefined : (JSON.parse(prefillKey) as LoadPrefill),
          ),
    // Serialised so a freshly built prefill object on every keystroke does not
    // re-seed the form while the dialog is open.
    [load, defaultDate, prefillKey],
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
      toNumber(values.otherExpenses),
  );
  const totalMiles = loadedMiles + deadheadMiles;
  const tripProfit = roundMoney(grossRate - tripExpenses);
  const profitPerMile = div(tripProfit, totalMiles);
  const rating = rateLoad(profitPerMile, ratingThresholds);

  function submit(event: React.FormEvent) {
    event.preventDefault();

    const payload = {
      date: values.date,
      originCity: values.originCity,
      originState: values.originState,
      destinationCity: values.destinationCity,
      destinationState: values.destinationState,
      broker: values.broker || null,
      loadNumber: values.loadNumber || null,
      loadedMiles,
      deadheadMiles,
      grossRate,
      fuelCost: toNumber(values.fuelCost),
      tolls: toNumber(values.tolls),
      dispatchFee: toNumber(values.dispatchFee),
      factoringFee: toNumber(values.factoringFee),
      otherExpenses: toNumber(values.otherExpenses),
      status: values.status,
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Date" htmlFor="load-date" required error={errors.date}>
                <Input
                  id="load-date"
                  type="date"
                  value={values.date}
                  onChange={(e) => set("date", e.target.value)}
                  aria-invalid={Boolean(errors.date)}
                  required
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
              <Field label="Broker" htmlFor="load-broker" className="col-span-2" error={errors.broker}>
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

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
              <Calc label="Trip expenses" value={formatMoney(tripExpenses)} />
              <Calc
                label="Trip profit"
                value={formatMoney(tripProfit)}
                tone={tripProfit >= 0 ? "pos" : "neg"}
              />
              <Calc
                label="Profit / mile"
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
