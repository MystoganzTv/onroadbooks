"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";
import { useLanguage } from "@/components/shell/language-provider";
import { interpolate } from "@/lib/i18n/dictionaries";

import {
  DocumentUploader,
  uploadPending,
  type PendingUpload,
} from "@/components/documents/document-uploader";
import { DocumentList } from "@/components/documents/document-list";
import { Field } from "@/components/shared/field";
import { fieldErrors, focusFirstError, validationMessage } from "@/lib/form";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createMaintenanceAction,
  updateMaintenanceAction,
} from "@/lib/actions/maintenance";
import { formatMoney } from "@/lib/formatters";
import { MAINTENANCE_TYPES, suggestNextService } from "@/lib/maintenance";
import { todayISO } from "@/lib/periods";
import { maintenanceSchema } from "@/lib/schemas";
import type {
  Document,
  MaintenanceBasis,
  MaintenanceRecord,
  MaintenanceType,
} from "@/lib/types";
import { cn, toNumber } from "@/lib/utils";

const FIELD_LABELS: Record<string, string> = {
  vendor: "Vendor",
  notes: "Notes",
  type: "Service type",
  serviceDate: "Service date",
  odometer: "Odometer",
  cost: "Cost",
  nextServiceDate: "Next service date",
  nextServiceOdometer: "Next service odometer",
};

interface FormState {
  type: MaintenanceType;
  basis: MaintenanceBasis;
  serviceDate: string;
  odometer: string;
  cost: string;
  vendor: string;
  nextServiceDate: string;
  nextServiceOdometer: string;
  notes: string;
  recordAsExpense: boolean;
}

const BASIS_OPTIONS: { id: MaintenanceBasis; label: string; hint: string }[] = [
  { id: "DATE", label: "Date", hint: "Tracked on a calendar date" },
  { id: "MILEAGE", label: "Mileage", hint: "Tracked on the odometer" },
  { id: "BOTH", label: "Both", hint: "Whichever comes first" },
];

interface MaintenanceFormDialogProps {
  record?: MaintenanceRecord;
  documents?: Document[];
  currentOdometer: number;
  /** The unit whose page this is. Service belongs to a specific truck. */
  truckId?: string;
  trigger?: React.ReactNode;
}

export function MaintenanceFormDialog({
  record,
  documents = [],
  currentOdometer,
  truckId,
  trigger,
}: MaintenanceFormDialogProps) {
  const { dictionary, locale } = useLanguage();
  const copy = dictionary.maintenance;
  const router = useRouter();
  const isEdit = Boolean(record);

  const initial = React.useMemo<FormState>(() => {
    if (record) {
      return {
        type: record.type,
        basis: record.basis,
        serviceDate: record.serviceDate,
        odometer: record.odometer ? String(record.odometer) : "",
        cost: String(record.cost),
        vendor: record.vendor ?? "",
        nextServiceDate: record.nextServiceDate ?? "",
        nextServiceOdometer: record.nextServiceOdometer ? String(record.nextServiceOdometer) : "",
        notes: record.notes ?? "",
        recordAsExpense: Boolean(record.expenseId),
      };
    }
    const today = todayISO();
    const suggestion = suggestNextService("OIL_CHANGE", today, currentOdometer);
    return {
      type: "OIL_CHANGE",
      basis: suggestion.basis,
      serviceDate: today,
      odometer: String(currentOdometer),
      cost: "",
      vendor: "",
      nextServiceDate: suggestion.nextServiceDate ?? "",
      nextServiceOdometer: suggestion.nextServiceOdometer
        ? String(suggestion.nextServiceOdometer)
        : "",
      notes: "",
      recordAsExpense: true,
    };
  }, [record, currentOdometer]);

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

  /** Changing the type re-suggests the interval, which is most of the typing. */
  function changeType(next: MaintenanceType) {
    const suggestion = suggestNextService(
      next,
      values.serviceDate,
      toNumber(values.odometer) || currentOdometer,
    );
    setValues((prev) => ({
      ...prev,
      type: next,
      basis: suggestion.basis,
      nextServiceDate: suggestion.nextServiceDate ?? "",
      nextServiceOdometer: suggestion.nextServiceOdometer
        ? String(suggestion.nextServiceOdometer)
        : "",
    }));
  }

  const needsDate = values.basis !== "MILEAGE";
  const needsMiles = values.basis !== "DATE";

  function submit(event: React.FormEvent) {
    event.preventDefault();

    const payload = {
      truckId: record?.truckId ?? truckId ?? null,
      type: values.type,
      basis: values.basis,
      serviceDate: values.serviceDate,
      odometer: values.odometer ? toNumber(values.odometer) : null,
      cost: toNumber(values.cost),
      vendor: values.vendor || null,
      nextServiceDate: needsDate && values.nextServiceDate ? values.nextServiceDate : null,
      nextServiceOdometer:
        needsMiles && values.nextServiceOdometer ? toNumber(values.nextServiceOdometer) : null,
      notes: values.notes || null,
      recordAsExpense: values.recordAsExpense,
    };

    const parsed = maintenanceSchema.safeParse(payload);
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors(next);
      // A failure the user cannot see is a dead button: announce it, name the
      // fields, and move focus to the first one.
      toast.error(validationMessage(next, FIELD_LABELS));
      requestAnimationFrame(() => focusFirstError("maintenance-form"));
      return;
    }

    setErrors({});
    startTransition(async () => {
      const result = isEdit
        ? await updateMaintenanceAction(record!.id, payload)
        : await createMaintenanceAction(payload);

      if (result.ok) {
        const upload = result.id
          ? await uploadPending("MAINTENANCE", result.id, attachments)
          : { uploaded: 0, failed: 0 };
        if (upload.failed > 0) {
          toast.error(interpolate(copy.documentFailed, { error: upload.error ?? "" }).trim());
        }
        toast.success(isEdit ? copy.updated : copy.logged, {
          description:
            payload.cost > 0 && payload.recordAsExpense
              ? interpolate(copy.addedLedger, { amount: formatMoney(payload.cost) })
              : undefined,
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
            {copy.logService}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? copy.editService : copy.formTitle}</DialogTitle>
          <DialogDescription>
            {copy.formDescription}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <form id="maintenance-form" onSubmit={submit} className="space-y-4" noValidate>
            <div className="grid grid-cols-2 gap-3">
              <Field label={copy.serviceType} htmlFor="maint-type" required error={errors.type}>
                <Select value={values.type} onValueChange={(v) => changeType(v as MaintenanceType)}>
                  <SelectTrigger id="maint-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MAINTENANCE_TYPES.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {locale === "es" ? type.labelEs : type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label={copy.serviceDate}
                htmlFor="maint-date"
                required
                error={errors.serviceDate}
              >
                <Input
                  id="maint-date"
                  type="date"
                  aria-invalid={Boolean(errors.serviceDate)}
                  value={values.serviceDate}
                  onChange={(e) => set("serviceDate", e.target.value)}
                  required
                />
              </Field>
            </div>

            <div>
              <Label className="mb-1.5 block">{copy.trackedBy}</Label>
              <div
                className="inline-flex rounded-md border border-border bg-surface-sunken p-0.5"
                role="group"
                aria-label={copy.trackingBasis}
              >
                {BASIS_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    title={option.hint}
                    aria-pressed={values.basis === option.id}
                    onClick={() => set("basis", option.id)}
                    className={cn(
                      "rounded px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      values.basis === option.id
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option.id === "DATE" ? copy.byDate : option.id === "MILEAGE" ? copy.byMileage : copy.both}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-2xs text-muted-foreground">
                {values.basis === "DATE" ? copy.dateHint : values.basis === "MILEAGE" ? copy.mileageHint : copy.bothHint}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label={copy.odometer} htmlFor="maint-odometer" error={errors.odometer}>
                <Input
                  id="maint-odometer"
                  type="number"
                  min={0}
                  step={1}
                  value={values.odometer}
                  onChange={(e) => set("odometer", e.target.value)}
                />
              </Field>
              <Field label={copy.cost} htmlFor="maint-cost" error={errors.cost}>
                <Input
                  id="maint-cost"
                  type="number"
                  aria-invalid={Boolean(errors.cost)}
                  min={0}
                  step="0.01"
                  value={values.cost}
                  onChange={(e) => set("cost", e.target.value)}
                  placeholder="0.00"
                />
              </Field>
              <Field label={copy.vendor} htmlFor="maint-vendor" error={errors.vendor}>
                <Input
                  id="maint-vendor"
                  maxLength={120}
                  aria-invalid={Boolean(errors.vendor)}
                  value={values.vendor}
                  onChange={(e) => set("vendor", e.target.value)}
                  placeholder={copy.optional}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-surface-sunken p-3">
              <Field
                label={copy.nextDate}
                htmlFor="maint-next-date"
                required={needsDate}
                error={errors.nextServiceDate}
                className={cn(!needsDate && "opacity-40")}
              >
                <Input
                  id="maint-next-date"
                  type="date"
                  value={values.nextServiceDate}
                  onChange={(e) => set("nextServiceDate", e.target.value)}
                  disabled={!needsDate}
                />
              </Field>
              <Field
                label={copy.nextOdometer}
                htmlFor="maint-next-odo"
                required={needsMiles}
                error={errors.nextServiceOdometer}
                className={cn(!needsMiles && "opacity-40")}
              >
                <Input
                  id="maint-next-odo"
                  type="number"
                  min={0}
                  step={1}
                  value={values.nextServiceOdometer}
                  onChange={(e) => set("nextServiceOdometer", e.target.value)}
                  disabled={!needsMiles}
                />
              </Field>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <div className="pr-4">
                <Label
                  htmlFor="maint-expense"
                  className="normal-case tracking-normal text-foreground"
                >
                  {copy.recordExpense}
                </Label>
                <p className="mt-0.5 text-2xs text-muted-foreground">
                  {copy.expenseDescription}
                </p>
                {isEdit && record?.expenseId && !values.recordAsExpense ? (
                  <p className="mt-1 text-2xs text-warn">
                    {copy.deletesLedger}
                  </p>
                ) : null}
              </div>
              <Switch
                id="maint-expense"
                checked={values.recordAsExpense}
                onCheckedChange={(checked) => set("recordAsExpense", checked)}
              />
            </div>

            <Field label={copy.notes} htmlFor="maint-notes" error={errors.notes}>
              <Textarea
                id="maint-notes"
                rows={2}
                maxLength={2000}
                aria-invalid={Boolean(errors.notes)}
                value={values.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder={copy.optional}
              />
            </Field>

            <div className="space-y-2 border-t border-border pt-3">
              <p className="label-xs">{copy.receipt}</p>
              {isEdit && record ? (
                <>
                  {documents.length > 0 ? <DocumentList documents={documents} /> : null}
                  <DocumentUploader owner="MAINTENANCE" entityId={record.id} compact />
                </>
              ) : (
                <DocumentUploader
                  owner="MAINTENANCE"
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
          <Button type="submit" form="maintenance-form" size="sm" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {isEdit ? copy.saveChanges : copy.logService}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
