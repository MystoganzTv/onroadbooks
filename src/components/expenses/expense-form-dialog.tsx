"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/shared/field";
import { fieldErrors, focusFirstError, validationMessage } from "@/lib/form";
import {
  DocumentUploader,
  uploadPending,
  type PendingUpload,
} from "@/components/documents/document-uploader";
import { Label } from "@/components/ui/label";
import { createExpenseAction, updateExpenseAction } from "@/lib/actions/expenses";
import { behaviorOf, categoryLabel, EXPENSE_CATEGORIES } from "@/lib/categories";
import { formatMoney } from "@/lib/formatters";
import { formatLocaleDate } from "@/lib/i18n-format";
import { todayISO } from "@/lib/periods";
import { expenseSchema } from "@/lib/schemas";
import { DocumentList } from "@/components/documents/document-list";
import { orderedTrucks } from "@/lib/fleet";
import type {
  Document,
  Expense,
  ExpenseBehavior,
  ExpenseCategoryId,
  LoadWithMetrics,
  Truck,
} from "@/lib/types";
import { toNumber } from "@/lib/utils";

/** The sentinel the "charged to" control uses for fleet overhead. */
const BUSINESS = "BUSINESS";

interface FormState {
  /** A truck id, or BUSINESS for overhead. Empty when there is no fleet. */
  charge: string;
  date: string;
  category: ExpenseCategoryId;
  description: string;
  vendor: string;
  amount: string;
  loadId: string;
  recurring: boolean;
  receiptNumber: string;
  notes: string;
}

function emptyState(defaultDate: string, charge: string): FormState {
  return {
    charge,
    date: defaultDate,
    category: "FUEL",
    description: "",
    vendor: "",
    amount: "",
    loadId: "none",
    recurring: false,
    receiptNumber: "",
    notes: "",
  };
}

interface ExpenseFormDialogProps {
  expense?: Expense;
  documents?: Document[];
  loads?: LoadWithMetrics[];
  trucks?: Truck[];
  /** Preselects the unit the page is currently scoped to. */
  defaultTruckId?: string | null;
  defaultDate?: string;
  categoryBehavior?: Record<string, ExpenseBehavior>;
  trigger?: React.ReactNode;
}

/** Add / edit an expense. Three fields to save: date, category, amount. */
export function ExpenseFormDialog({
  expense,
  documents = [],
  loads = [],
  trucks = [],
  defaultTruckId,
  defaultDate,
  categoryBehavior,
  trigger,
}: ExpenseFormDialogProps) {
  const router = useRouter();
  const { locale, dictionary } = useLanguage();
  const copy = dictionary.expenses;
  const common = dictionary.common;
  const isEdit = Boolean(expense);

  /**
   * Who the cost is charged to.
   *
   * A retired unit stays in the list only while an existing expense still
   * points at it, so editing history never silently re-assigns the charge.
   */
  const chargeOptions = React.useMemo(
    () => orderedTrucks(trucks).filter((t) => t.active || t.id === expense?.truckId),
    [trucks, expense?.truckId],
  );
  /*
   * Shown once the business has ever run more than one truck -- not once it
   * has more than one RUNNING. A fleet that is temporarily down to a single
   * unit still has overhead, and hiding the control on that day would leave
   * the owner no way to record the phone bill as anything but that truck's
   * cost. A business that has only ever had one truck is not asked, because
   * for it "the truck" and "the business" are the same thing.
   */
  const showCharge = trucks.length > 1;
  const defaultCharge = defaultTruckId ?? chargeOptions.find((t) => t.active)?.id ?? "";

  const initial = React.useMemo<FormState>(
    () =>
      expense
        ? {
            charge: expense.scope === "BUSINESS" ? BUSINESS : (expense.truckId ?? ""),
            date: expense.date,
            category: expense.category,
            description: expense.description,
            vendor: expense.vendor ?? "",
            amount: String(expense.amount),
            loadId: expense.loadId ?? "none",
            recurring: expense.recurring,
            receiptNumber: expense.receiptNumber ?? "",
            notes: expense.notes ?? "",
          }
        : emptyState(defaultDate ?? todayISO(), defaultCharge),
    [expense, defaultDate, defaultCharge],
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

  const behavior = behaviorOf(values.category, categoryBehavior);
  const canLinkToLoad = ["FUEL", "TOLLS", "DISPATCH", "FACTORING", "OTHER"].includes(values.category);

  // A linked load is not just a label: it determines which unit caused the
  // cost. Only offer loads from the selected truck, and keep an existing
  // historical link visible only while that same truck remains selected.
  const linkOptions = React.useMemo(() => {
    if (!values.charge || values.charge === BUSINESS) return [];
    const matching = loads.filter((load) => load.truckId === values.charge);
    const visible = matching.slice(0, 40);
    const linkedId = expense?.loadId;
    if (!linkedId || visible.some((l) => l.id === linkedId)) return visible;
    const linked = matching.find((l) => l.id === linkedId);
    return linked ? [linked, ...visible] : visible;
  }, [loads, expense?.loadId, values.charge]);

  function changeCharge(charge: string) {
    setValues((prev) => {
      const linked = loads.find((load) => load.id === prev.loadId);
      return {
        ...prev,
        charge,
        loadId:
          charge !== BUSINESS && linked?.truckId === charge ? prev.loadId : "none",
      };
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();

    // An empty charge means this business has no fleet to choose between:
    // send no truck and let the store bill the one unit that exists.
    const business = values.charge === BUSINESS;
    const payload = {
      scope: business ? ("BUSINESS" as const) : ("TRUCK" as const),
      truckId: business || !values.charge ? null : values.charge,
      date: values.date,
      category: values.category,
      description: values.description,
      vendor: values.vendor || null,
      amount: toNumber(values.amount),
      loadId: !canLinkToLoad || values.loadId === "none" ? null : values.loadId,
      recurring: values.recurring,
      receiptNumber: values.receiptNumber || null,
      notes: values.notes || null,
    };

    const parsed = expenseSchema.safeParse(payload);
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors(next);
      // A failure the user cannot see is a dead button: announce it, name the
      // fields, and move focus to the first one.
      toast.error(validationMessage(next, {
        vendor: copy.vendor,
        notes: copy.notes,
        description: copy.description,
        amount: copy.amount,
        category: copy.category,
        date: copy.date,
        receiptNumber: copy.receiptNumber,
      }));
      requestAnimationFrame(() => focusFirstError("expense-form"));
      return;
    }

    setErrors({});
    startTransition(async () => {
      const result = isEdit
        ? await updateExpenseAction(expense!.id, payload)
        : await createExpenseAction(payload);

      if (result.ok) {
        const upload = result.id
          ? await uploadPending("EXPENSE", result.id, attachments)
          : { uploaded: 0, failed: 0 };
        toast.success(isEdit ? copy.expenseUpdated : copy.expenseAdded, {
          description:
            `${values.description} - ${formatMoney(toNumber(values.amount))}` +
            (upload.uploaded ? ` · ${copy.receiptAttachedSuffix}` : ""),
        });
        if (upload.failed > 0) {
          toast.error(`${copy.receiptUploadFailed} ${upload.error ?? ""}`.trim());
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
          <Button size="sm" variant="outline">
            <Plus />
            {copy.addExpense}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? copy.editExpense
              : copy.addExpense}
          </DialogTitle>
          <DialogDescription>
            {copy.formDescription}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <form id="expense-form" onSubmit={submit} className="space-y-4" noValidate>
            <div className="grid grid-cols-2 gap-3">
              <Field label={copy.date} htmlFor="expense-date" required error={errors.date}>
                <Input
                  id="expense-date"
                  type="date"
                  value={values.date}
                  onChange={(e) => set("date", e.target.value)}
                  aria-invalid={Boolean(errors.date)}
                  required
                />
              </Field>
              <Field label={copy.amount} htmlFor="expense-amount" required error={errors.amount}>
                <Input
                  id="expense-amount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={values.amount}
                  onChange={(e) => set("amount", e.target.value)}
                  placeholder="0.00"
                  aria-invalid={Boolean(errors.amount)}
                  required
                />
              </Field>
            </div>

            {showCharge ? (
              <Field
                label={copy.chargedTo}
                htmlFor="expense-charge"
                required
                hint={
                  values.charge === BUSINESS
                    ? copy.overheadHint
                    : copy.truckProfitHint
                }
              >
                <Select value={values.charge} onValueChange={changeCharge}>
                  <SelectTrigger id="expense-charge">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {chargeOptions.map((truck) => (
                      <SelectItem key={truck.id} value={truck.id}>
                        {truck.name}
                        {truck.active ? "" : ` (${copy.retired})`}
                      </SelectItem>
                    ))}
                    <SelectItem value={BUSINESS}>{copy.businessOverhead}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            ) : null}

            <Field
              label={copy.category}
              htmlFor="expense-category"
              required
              hint={behavior === "FIXED" ? copy.fixedClassification : copy.variableClassification}
              error={errors.category}
            >
              <Select
                value={values.category}
                onValueChange={(value) => set("category", value as ExpenseCategoryId)}
              >
                <SelectTrigger id="expense-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {categoryLabel(category.id, locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label={copy.description}
              htmlFor="expense-description"
              required
              error={errors.description}
            >
              <Input
                id="expense-description"
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder={copy.descriptionPlaceholder}
                aria-invalid={Boolean(errors.description)}
                required
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={copy.vendor} htmlFor="expense-vendor" error={errors.vendor}>
                <Input
                  id="expense-vendor"
                  maxLength={120}
                  aria-invalid={Boolean(errors.vendor)}
                  value={values.vendor}
                  onChange={(e) => set("vendor", e.target.value)}
                  placeholder={copy.optional}
                />
              </Field>
              {canLinkToLoad ? <Field
                label={copy.linkToLoad}
                htmlFor="expense-load"
                hint={
                  values.charge === BUSINESS
                    ? copy.overheadNoLoad
                    : copy.truckLoadsOnly
                }
              >
                <Select value={values.loadId} onValueChange={(value) => set("loadId", value)}>
                  <SelectTrigger id="expense-load" disabled={values.charge === BUSINESS}>
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
              </Field> : null}
            </div>

            <Field
              label={copy.receiptNumber}
              htmlFor="expense-receipt"
              hint={copy.receiptReference}
              error={errors.receiptNumber}
            >
              <Input
                id="expense-receipt"
                maxLength={80}
                aria-invalid={Boolean(errors.receiptNumber)}
                value={values.receiptNumber}
                onChange={(e) => set("receiptNumber", e.target.value)}
                placeholder={copy.optional}
              />
            </Field>

            <div className="flex items-center justify-between rounded-md border border-border bg-surface-sunken px-3 py-2">
              <div>
                <Label htmlFor="expense-recurring" className="normal-case tracking-normal text-foreground">
                  {copy.recurringExpense}
                </Label>
                <p className="mt-0.5 text-2xs text-muted-foreground">
                  {copy.recurringDescription}
                </p>
              </div>
              <Switch
                id="expense-recurring"
                checked={values.recurring}
                onCheckedChange={(checked) => set("recurring", checked)}
              />
            </div>

            <Field label={copy.notes} htmlFor="expense-notes" error={errors.notes}>
              <Textarea
                id="expense-notes"
                maxLength={2000}
                aria-invalid={Boolean(errors.notes)}
                value={values.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={2}
                placeholder={copy.optional}
              />
            </Field>

            <div className="space-y-2 border-t border-border pt-3">
              <p className="label-xs">{copy.receipt}</p>
              {isEdit && expense ? (
                <>
                  {documents.length > 0 ? <DocumentList documents={documents} /> : null}
                  <DocumentUploader owner="EXPENSE" entityId={expense.id} compact />
                </>
              ) : (
                <DocumentUploader
                  owner="EXPENSE"
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
            {common.cancel}
          </Button>
          <Button type="submit" form="expense-form" size="sm" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {isEdit ? common.saveChanges : copy.addExpense}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
