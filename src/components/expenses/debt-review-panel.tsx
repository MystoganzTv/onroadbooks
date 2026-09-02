"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleDollarSign, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { classifyDebtPaymentAction } from "@/lib/actions/expenses";
import { reconcileDebtPaymentSplit } from "@/lib/finance/debt-payment";
import { formatDateShort, formatMoney } from "@/lib/formatters";
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
          <CardTitle>Payments needing financial classification</CardTitle>
        </div>
        <span className="text-2xs text-muted-foreground">
          No loan/lease assumption has been made. Review {unknown.length} historical {unknown.length === 1 ? "payment" : "payments"} explicitly.
        </span>
      </CardHeader>
      <CardContent className="divide-y divide-border p-0">
        {unknown.map((expense) => (
          <div key={expense.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{expense.description}</p>
              <p className="text-xs text-muted-foreground">{formatDateShort(expense.date)} · {expense.vendor ?? "No lender recorded"} · {trucks.find((truck) => truck.id === expense.truckId)?.name ?? "Business"}</p>
            </div>
            <span className="tnum text-sm font-semibold">{formatMoney(expense.amount)}</span>
            <DebtClassificationDialog expense={expense} obligations={obligations} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DebtClassificationDialog({
  expense,
  obligations,
}: {
  expense: Expense;
  obligations: FinancialObligation[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [treatment, setTreatment] = React.useState<Treatment>("LOAN_SPLIT");
  const [obligationId, setObligationId] = React.useState("new");
  const [name, setName] = React.useState(expense.vendor ?? "");
  const [monthlyPayment, setMonthlyPayment] = React.useState(String(expense.amount));
  const [principal, setPrincipal] = React.useState(String(expense.amount));
  const [interest, setInterest] = React.useState("0");
  const principalValue = Number(principal);
  const interestValue = Number(interest);
  const splitInputsValid = principal.trim() !== ""
    && interest.trim() !== ""
    && Number.isFinite(principalValue)
    && Number.isFinite(interestValue)
    && principalValue >= 0
    && interestValue >= 0;
  const reconciliation = reconcileDebtPaymentSplit(
    expense.amount,
    principalValue,
    interestValue,
  );
  const splitBalanced = treatment !== "LOAN_SPLIT"
    || (splitInputsValid && reconciliation.state === "BALANCED");

  const matching = obligations.filter((obligation) =>
    treatment === "LOAN_SPLIT"
      ? obligation.kind === "LOAN"
      : treatment === "OPERATING_LEASE"
        ? obligation.kind === "OPERATING_LEASE"
        : obligation.kind === "UNKNOWN",
  );

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!splitBalanced) {
      toast.error("Principal + interest must equal the payment exactly.", {
        description: splitMessage(reconciliation, expense.amount),
      });
      return;
    }
    const creating = obligationId === "new" && name.trim().length > 0;
    startTransition(async () => {
      const result = await classifyDebtPaymentAction(expense.id, {
        treatment,
        obligationId: obligationId !== "new" && obligationId !== "none" ? obligationId : null,
        newObligation: creating
          ? {
              truckId: expense.truckId,
              name,
              kind:
                treatment === "LOAN_SPLIT"
                  ? "LOAN"
                  : treatment === "OPERATING_LEASE"
                    ? "OPERATING_LEASE"
                    : "UNKNOWN",
              counterparty: expense.vendor,
              expectedMonthlyPayment: Number(monthlyPayment) || null,
              active: true,
            }
          : undefined,
        principalAmount: treatment === "LOAN_SPLIT" ? Number(principal) : undefined,
        interestAmount: treatment === "LOAN_SPLIT" ? Number(interest) : undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Payment classified", { description: "The original total was preserved." });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline">Review</Button></DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Classify {formatMoney(expense.amount)} payment</DialogTitle>
            <DialogDescription>
              This explicit review may split the existing row, but will never change its total.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Field label="Financial treatment" htmlFor={`treatment-${expense.id}`} required>
              <Select value={treatment} onValueChange={(value) => { setTreatment(value as Treatment); setObligationId("new"); }}>
                <SelectTrigger id={`treatment-${expense.id}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOAN_SPLIT">Loan — split principal and interest</SelectItem>
                  <SelectItem value="OPERATING_LEASE">Operating lease — operating expense</SelectItem>
                  <SelectItem value="DEBT_UNALLOCATED">Keep unknown — debt service</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Obligation" htmlFor={`obligation-${expense.id}`}>
              <Select value={obligationId} onValueChange={setObligationId}>
                <SelectTrigger id={`obligation-${expense.id}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Create from this review</SelectItem>
                  <SelectItem value="none">No obligation record</SelectItem>
                  {matching.map((obligation) => <SelectItem key={obligation.id} value={obligation.id}>{obligation.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>

            {obligationId === "new" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Obligation name" htmlFor={`obligation-name-${expense.id}`}>
                  <Input id={`obligation-name-${expense.id}`} value={name} onChange={(event) => setName(event.target.value)} placeholder="Truck loan or lease" />
                </Field>
                <Field label="Expected monthly payment" htmlFor={`monthly-payment-${expense.id}`}>
                  <Input id={`monthly-payment-${expense.id}`} inputMode="decimal" value={monthlyPayment} onChange={(event) => setMonthlyPayment(event.target.value)} />
                </Field>
              </div>
            ) : null}

            {treatment === "LOAN_SPLIT" ? (
              <div className="space-y-3">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Principal" htmlFor={`principal-${expense.id}`} required>
                    <Input
                      id={`principal-${expense.id}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max={expense.amount}
                      step="0.01"
                      value={principal}
                      aria-invalid={!splitInputsValid || reconciliation.state === "OVER"}
                      onChange={(event) => setPrincipal(event.target.value)}
                    />
                  </Field>
                  <Field label="Interest" htmlFor={`interest-${expense.id}`} required>
                    <Input
                      id={`interest-${expense.id}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max={expense.amount}
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
                    <span className="text-muted-foreground">Payment to classify</span>
                    <span className="font-semibold tnum">{formatMoney(expense.amount)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">Principal + interest</span>
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
                      ? splitMessage(reconciliation, expense.amount)
                      : "Enter valid non-negative amounts before continuing."}
                  </p>
                </div>
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending || !splitBalanced}>{pending ? <Loader2 className="animate-spin" /> : null} Confirm classification</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function splitMessage(
  reconciliation: ReturnType<typeof reconcileDebtPaymentSplit>,
  paymentAmount: number,
): string {
  if (reconciliation.state === "BALANCED") return "Balanced exactly. Ready to classify.";
  if (reconciliation.state === "UNDER") {
    return `${formatMoney(reconciliation.difference)} still needs to be assigned.`;
  }
  if (reconciliation.state === "OVER") {
    return `${formatMoney(Math.abs(reconciliation.difference))} over the ${formatMoney(paymentAmount)} payment. Reduce principal or interest.`;
  }
  return "Enter valid non-negative amounts before continuing.";
}
