"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleDollarSign, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";
import { useLanguage } from "@/components/shell/language-provider";

import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { classifyDebtPaymentAction } from "@/lib/actions/expenses";
import { roundMoney } from "@/lib/calculations";
import { reconcileDebtPaymentSplit } from "@/lib/finance/debt-payment";
import { formatMoney } from "@/lib/formatters";
import { formatLocaleDate } from "@/lib/i18n-format";
import { interpolate, type WebDictionary } from "@/lib/i18n/dictionaries";
import type { Expense, FinancialObligation, Truck } from "@/lib/types";
import { cn } from "@/lib/utils";

type Treatment = "LOAN_SPLIT" | "OPERATING_LEASE" | "DEBT_UNALLOCATED";

export function DebtReviewPanel({
  expenses,
  obligations,
  trucks,
}: {
  expenses: Expense[];
  obligations: FinancialObligation[];
  trucks: Truck[];
}) {
  const { locale, dictionary } = useLanguage();
  const copy = dictionary.expenses;
  const unknown = expenses.filter(
    (expense) =>
      expense.category === "TRUCK_PAYMENT" &&
      (expense.financialTreatment ?? "DEBT_UNALLOCATED") === "DEBT_UNALLOCATED",
  );
  if (unknown.length === 0) return null;
  return (
    <Card className="border-warn/40">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CircleDollarSign className="size-4 text-warn" />
          <CardTitle>{copy.paymentsNeedClassification}</CardTitle>
        </div>
        <span className="text-2xs text-muted-foreground">
          {interpolate(copy.classificationNote, { count: unknown.length, unit: unknown.length === 1 ? copy.payment : copy.payments })}
        </span>
      </CardHeader>
      <CardContent className="divide-y divide-border p-0">
        {unknown.map((expense) => (
          <div key={expense.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{expense.description}</p>
              <p className="text-xs text-muted-foreground">{formatLocaleDate(expense.date, locale, { month: "short", day: "numeric" })} · {expense.vendor ?? copy.noLender} · {trucks.find((truck) => truck.id === expense.truckId)?.name ?? copy.business}</p>
            </div>
            <span className="tnum text-sm font-semibold">{formatMoney(expense.amount)}</span>
            <DebtClassificationDialog expense={expense} obligations={obligations} trucks={trucks} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function DebtClassificationDialog({
  expense,
  obligations,
  trucks,
  paymentRows,
  trigger,
}: {
  expense: Expense;
  obligations: FinancialObligation[];
  trucks: Truck[];
  paymentRows?: Expense[];
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const { dictionary } = useLanguage();
  const copy = dictionary.expenses;
  const common = dictionary.common;
  const editingSplit = Boolean(expense.splitGroupId);
  const rows = React.useMemo(
    () => paymentRows?.filter((row) => row.splitGroupId === expense.splitGroupId) ?? [expense],
    [expense, paymentRows],
  );
  const storedPaymentAmount = rows.reduce((total, row) => total + row.amount, 0);
  const currentPrincipal = rows.find((row) => row.financialTreatment === "PRINCIPAL")?.amount ?? 0;
  const currentInterest = rows.find((row) => row.financialTreatment === "INTEREST")?.amount ?? 0;
  const currentNotes = rows.find((row) => row.financialTreatment === "PRINCIPAL")?.notes
    ?? rows[0]?.notes
    ?? expense.notes
    ?? "";
  const initialObligationId = expense.obligationId ?? (editingSplit ? "none" : "new");
  const initialObligation = obligations.find((obligation) => obligation.id === initialObligationId);

  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [treatment, setTreatment] = React.useState<Treatment>("LOAN_SPLIT");
  const [obligationId, setObligationId] = React.useState(initialObligationId);
  const [obligationName, setObligationName] = React.useState(initialObligation?.name ?? expense.vendor ?? "");
  const [monthlyPayment, setMonthlyPayment] = React.useState(String(initialObligation?.expectedMonthlyPayment ?? storedPaymentAmount));
  const [obligationTruckId, setObligationTruckId] = React.useState(initialObligation?.truckId ?? expense.truckId ?? "none");
  const [obligationActive, setObligationActive] = React.useState(initialObligation?.active ?? true);
  const [paymentTotal, setPaymentTotal] = React.useState(String(storedPaymentAmount));
  const [date, setDate] = React.useState(expense.date);
  const [description, setDescription] = React.useState(expense.description.replace(/ · interest$/u, ""));
  const [vendor, setVendor] = React.useState(expense.vendor ?? "");
  const [recurring, setRecurring] = React.useState(expense.recurring);
  const [principal, setPrincipal] = React.useState(String(editingSplit ? currentPrincipal : expense.amount));
  const [interest, setInterest] = React.useState(String(editingSplit ? currentInterest : 0));
  const [notes, setNotes] = React.useState(currentNotes);

  React.useEffect(() => {
    if (!open) return;
    setTreatment("LOAN_SPLIT");
    setObligationId(initialObligationId);
    setObligationName(initialObligation?.name ?? expense.vendor ?? "");
    setMonthlyPayment(String(initialObligation?.expectedMonthlyPayment ?? storedPaymentAmount));
    setObligationTruckId(initialObligation?.truckId ?? expense.truckId ?? "none");
    setObligationActive(initialObligation?.active ?? true);
    setPaymentTotal(String(storedPaymentAmount));
    setDate(expense.date);
    setDescription(expense.description.replace(/ · interest$/u, ""));
    setVendor(expense.vendor ?? "");
    setRecurring(expense.recurring);
    setPrincipal(String(editingSplit ? currentPrincipal : expense.amount));
    setInterest(String(editingSplit ? currentInterest : 0));
    setNotes(currentNotes);
  }, [
    currentInterest,
    currentPrincipal,
    currentNotes,
    editingSplit,
    expense.amount,
    expense.date,
    expense.description,
    expense.recurring,
    expense.truckId,
    expense.vendor,
    initialObligation,
    initialObligationId,
    open,
    storedPaymentAmount,
  ]);
  const paymentAmount = editingSplit ? Number(paymentTotal) : storedPaymentAmount;
  const principalValue = Number(principal);
  const interestValue = Number(interest);
  const paymentAmountValid = Number.isFinite(paymentAmount) && paymentAmount > 0;
  const splitInputsValid = paymentAmountValid
    && principal.trim() !== ""
    && interest.trim() !== ""
    && Number.isFinite(principalValue)
    && Number.isFinite(interestValue)
    && principalValue >= 0
    && interestValue >= 0;
  const reconciliation = reconcileDebtPaymentSplit(
    paymentAmount,
    principalValue,
    interestValue,
  );
  const splitBalanced = treatment !== "LOAN_SPLIT"
    || (splitInputsValid && reconciliation.state === "BALANCED");
  const paymentDetailsValid = !editingSplit
    || (paymentAmountValid && date.trim().length > 0 && description.trim().length > 0);
  const obligationDetailsValid = obligationId === "none" || obligationName.trim().length > 0;
  const formValid = splitBalanced && paymentDetailsValid && obligationDetailsValid;

  const matching = obligations.filter((obligation) =>
    treatment === "LOAN_SPLIT"
      ? obligation.kind === "LOAN"
      : treatment === "OPERATING_LEASE"
        ? obligation.kind === "OPERATING_LEASE"
        : obligation.kind === "UNKNOWN",
  );

  function changeObligation(nextId: string) {
    setObligationId(nextId);
    const selected = obligations.find((obligation) => obligation.id === nextId);
    setObligationName(selected?.name ?? expense.vendor ?? "");
    setMonthlyPayment(String(selected?.expectedMonthlyPayment ?? storedPaymentAmount));
    setObligationTruckId(selected?.truckId ?? expense.truckId ?? "none");
    setObligationActive(selected?.active ?? true);
  }

  function changePaymentTotal(nextTotal: string) {
    setPaymentTotal(nextTotal);
    const nextValue = Number(nextTotal);
    const currentInterestValue = Number(interest);
    if (
      nextTotal.trim() !== ""
      && interest.trim() !== ""
      && Number.isFinite(nextValue)
      && Number.isFinite(currentInterestValue)
      && nextValue > 0
      && currentInterestValue >= 0
      && currentInterestValue <= nextValue
    ) {
      setPrincipal(String(roundMoney(nextValue - currentInterestValue)));
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!formValid) {
      if (splitBalanced) return;
      toast.error(copy.exactRequired, {
        description: splitMessage(reconciliation, paymentAmount, copy),
      });
      return;
    }
    const creating = obligationId === "new" && obligationName.trim().length > 0;
    const updatingObligation = obligationId !== "new" && obligationId !== "none";
    startTransition(async () => {
      const result = await classifyDebtPaymentAction(expense.id, {
        treatment,
        obligationId: obligationId !== "new" && obligationId !== "none" ? obligationId : null,
        newObligation: creating
          ? {
              truckId: obligationTruckId === "none" ? null : obligationTruckId,
              name: obligationName,
              kind:
                treatment === "LOAN_SPLIT"
                  ? "LOAN"
                  : treatment === "OPERATING_LEASE"
                    ? "OPERATING_LEASE"
                    : "UNKNOWN",
              counterparty: editingSplit ? vendor.trim() || null : expense.vendor,
              expectedMonthlyPayment: Number(monthlyPayment) || null,
              active: obligationActive,
            }
          : undefined,
        obligationUpdate: updatingObligation
          ? {
              truckId: obligationTruckId === "none" ? null : obligationTruckId,
              name: obligationName,
              expectedMonthlyPayment: Number(monthlyPayment) || null,
              active: obligationActive,
            }
          : undefined,
        principalAmount: treatment === "LOAN_SPLIT" ? Number(principal) : undefined,
        interestAmount: treatment === "LOAN_SPLIT" ? Number(interest) : undefined,
        paymentAmount: editingSplit ? paymentAmount : undefined,
        date: editingSplit ? date : undefined,
        description: editingSplit ? description : undefined,
        vendor: editingSplit ? vendor.trim() || null : undefined,
        recurring: editingSplit ? recurring : undefined,
        notes: notes.trim() || null,
      });
      if (!result.ok) {
        toast.error(localizedClientError(result.error));
        return;
      }
      toast.success(editingSplit ? copy.paymentSplitUpdated : copy.paymentClassified, {
        description: editingSplit ? copy.paymentUpdatedTogether : copy.totalPreserved,
      });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button size="sm" variant="outline">{copy.review}</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>
              {editingSplit
                ? interpolate(copy.editLoanPayment, { amount: formatMoney(storedPaymentAmount) })
                : interpolate(copy.classifyPayment, { amount: formatMoney(storedPaymentAmount) })}
            </DialogTitle>
            <DialogDescription>
              {editingSplit ? copy.editLoanPaymentDescription : copy.classifyDescription}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {editingSplit ? (
              <div className="space-y-4 rounded-lg border border-border bg-surface-sunken/45 p-3">
                <p className="label-xs">{copy.paymentDetails}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={copy.date} htmlFor={`payment-date-${expense.id}`} required>
                    <Input
                      id={`payment-date-${expense.id}`}
                      type="date"
                      value={date}
                      onChange={(event) => setDate(event.target.value)}
                      required
                    />
                  </Field>
                  <Field label={copy.paymentTotal} htmlFor={`payment-total-${expense.id}`} required hint={copy.paymentTotalHint}>
                    <Input
                      id={`payment-total-${expense.id}`}
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="0.01"
                      value={paymentTotal}
                      onChange={(event) => changePaymentTotal(event.target.value)}
                      aria-invalid={!paymentAmountValid}
                      required
                    />
                  </Field>
                </div>
                <Field label={copy.description} htmlFor={`payment-description-${expense.id}`} required>
                  <Input
                    id={`payment-description-${expense.id}`}
                    maxLength={200}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    required
                  />
                </Field>
                <Field label={copy.lenderBank} htmlFor={`payment-vendor-${expense.id}`}>
                  <Input
                    id={`payment-vendor-${expense.id}`}
                    maxLength={120}
                    value={vendor}
                    onChange={(event) => setVendor(event.target.value)}
                    placeholder={copy.optional}
                  />
                </Field>
                <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
                  <div>
                    <Label htmlFor={`payment-recurring-${expense.id}`} className="normal-case tracking-normal text-foreground">
                      {copy.recurringExpense}
                    </Label>
                    <p className="mt-0.5 text-2xs text-muted-foreground">{copy.recurringDescription}</p>
                  </div>
                  <Switch
                    id={`payment-recurring-${expense.id}`}
                    checked={recurring}
                    onCheckedChange={setRecurring}
                  />
                </div>
              </div>
            ) : null}

            {!editingSplit ? <Field label={copy.treatment} htmlFor={`treatment-${expense.id}`} required>
              <Select value={treatment} onValueChange={(value) => { setTreatment(value as Treatment); changeObligation("new"); }}>
                <SelectTrigger id={`treatment-${expense.id}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOAN_SPLIT">{copy.loanSplit}</SelectItem>
                  <SelectItem value="OPERATING_LEASE">{copy.operatingLease}</SelectItem>
                  <SelectItem value="DEBT_UNALLOCATED">{copy.keepUnknown}</SelectItem>
                </SelectContent>
              </Select>
            </Field> : null}

            <Field label={copy.obligation} htmlFor={`obligation-${expense.id}`}>
              <Select value={obligationId} onValueChange={changeObligation}>
                <SelectTrigger id={`obligation-${expense.id}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">{copy.createFromReview}</SelectItem>
                  <SelectItem value="none">{copy.noObligation}</SelectItem>
                  {matching.map((obligation) => <SelectItem key={obligation.id} value={obligation.id}>{obligation.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>

            {obligationId !== "none" ? (
              <div className="space-y-4 rounded-lg border border-border p-3">
                <p className="label-xs">{copy.obligationDetails}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={copy.obligationName} htmlFor={`obligation-name-${expense.id}`} required>
                    <Input
                      id={`obligation-name-${expense.id}`}
                      value={obligationName}
                      onChange={(event) => setObligationName(event.target.value)}
                      placeholder={copy.obligationPlaceholder}
                      required
                    />
                  </Field>
                  <Field label={copy.expectedMonthlyPayment} htmlFor={`monthly-payment-${expense.id}`}>
                    <Input
                      id={`monthly-payment-${expense.id}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={monthlyPayment}
                      onChange={(event) => setMonthlyPayment(event.target.value)}
                    />
                  </Field>
                </div>
                <Field label={copy.associatedTruck} htmlFor={`obligation-truck-${expense.id}`}>
                  <Select value={obligationTruckId} onValueChange={setObligationTruckId}>
                    <SelectTrigger id={`obligation-truck-${expense.id}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{copy.noTruckAssociation}</SelectItem>
                      {trucks.map((truck) => <SelectItem key={truck.id} value={truck.id}>{truck.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="flex items-center justify-between rounded-md border border-border bg-surface-sunken px-3 py-2">
                  <div>
                    <Label htmlFor={`obligation-active-${expense.id}`} className="normal-case tracking-normal text-foreground">
                      {copy.obligationActive}
                    </Label>
                    <p className="mt-0.5 text-2xs text-muted-foreground">{copy.obligationActiveHint}</p>
                  </div>
                  <Switch
                    id={`obligation-active-${expense.id}`}
                    checked={obligationActive}
                    onCheckedChange={setObligationActive}
                  />
                </div>
              </div>
            ) : null}

            {treatment === "LOAN_SPLIT" ? (
              <div className="space-y-3">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={copy.principal} htmlFor={`principal-${expense.id}`} required>
                    <Input
                      id={`principal-${expense.id}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max={paymentAmountValid ? paymentAmount : undefined}
                      step="0.01"
                      value={principal}
                      aria-invalid={!splitInputsValid || reconciliation.state === "OVER"}
                      onChange={(event) => setPrincipal(event.target.value)}
                    />
                  </Field>
                  <Field label={copy.interest} htmlFor={`interest-${expense.id}`} required>
                    <Input
                      id={`interest-${expense.id}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max={paymentAmountValid ? paymentAmount : undefined}
                      step="0.01"
                      value={interest}
                      aria-invalid={!splitInputsValid || reconciliation.state === "OVER"}
                      onChange={(event) => setInterest(event.target.value)}
                    />
                  </Field>
                </div>
                <div
                  className={cn(
                    "rounded-lg border px-3 py-3",
                    reconciliation.state === "BALANCED"
                      ? "border-pos/35 bg-pos-soft/45"
                      : reconciliation.state === "OVER"
                        ? "border-neg/35 bg-neg-soft/35"
                        : "border-warn/35 bg-warn-soft/35",
                  )}
                  aria-live="polite"
                >
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">{copy.paymentToClassify}</span>
                    <span className="font-semibold tnum">{paymentAmountValid ? formatMoney(paymentAmount) : "—"}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">{copy.principalPlusInterest}</span>
                    <span className="font-semibold tnum">{splitInputsValid ? formatMoney(reconciliation.entered) : "—"}</span>
                  </div>
                  <p
                    className={cn(
                      "mt-2 border-t pt-2 text-xs font-medium",
                      reconciliation.state === "BALANCED"
                        ? "border-pos/20 text-pos"
                        : reconciliation.state === "OVER"
                          ? "border-neg/20 text-neg"
                          : "border-warn/20 text-warn",
                    )}
                  >
                    {splitInputsValid
                      ? splitMessage(reconciliation, paymentAmount, copy)
                      : copy.validAmounts}
                  </p>
                </div>
              </div>
            ) : null}

            <Field label={copy.notes} htmlFor={`payment-notes-${expense.id}`} hint={copy.bankPaymentNotesHint}>
              <Textarea
                id={`payment-notes-${expense.id}`}
                maxLength={2000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                placeholder={copy.optional}
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{common.cancel}</Button>
            <Button type="submit" disabled={pending || !formValid}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {editingSplit ? copy.saveLoanPaymentSplit : copy.confirmClassification}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function splitMessage(
  reconciliation: ReturnType<typeof reconcileDebtPaymentSplit>,
  paymentAmount: number,
  copy: WebDictionary["expenses"],
): string {
  if (reconciliation.state === "BALANCED") return copy.exactBalance;
  if (reconciliation.state === "UNDER") {
    return interpolate(copy.amountStillNeeded, { amount: formatMoney(reconciliation.difference) });
  }
  if (reconciliation.state === "OVER") {
    return interpolate(copy.amountOver, { amount: formatMoney(Math.abs(reconciliation.difference)), payment: formatMoney(paymentAmount) });
  }
  return copy.validAmounts;
}
