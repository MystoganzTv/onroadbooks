"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
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
import { updateLoadExpenseAction } from "@/lib/actions/expenses";
import { categoryLabel } from "@/lib/categories";
import { formatMoney } from "@/lib/formatters";
import { loadExpenseAmountSchema } from "@/lib/schemas";
import type { Expense } from "@/lib/types";

interface LoadExpenseFormDialogProps {
  expense: Expense;
  trigger: React.ReactNode;
}

/** Edits a generated ledger row at its load source without leaving Expenses. */
export function LoadExpenseFormDialog({ expense, trigger }: LoadExpenseFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState(String(expense.amount));
  const [error, setError] = React.useState<string>();
  const [pending, startTransition] = React.useTransition();

  function changeOpen(nextOpen: boolean) {
    if (nextOpen) {
      setAmount(String(expense.amount));
      setError(undefined);
    }
    setOpen(nextOpen);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const numericAmount = amount.trim() === "" ? Number.NaN : Number(amount);
    const parsed = loadExpenseAmountSchema.safeParse(numericAmount);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid amount.");
      return;
    }

    setError(undefined);
    startTransition(async () => {
      const result = await updateLoadExpenseAction(expense.id, parsed.data);
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }

      toast.success(parsed.data === 0 ? "Load expense removed" : "Load expense updated", {
        description:
          parsed.data === 0
            ? `${categoryLabel(expense.category)} was set to $0 on the load.`
            : `${categoryLabel(expense.category)} - ${formatMoney(parsed.data)}`,
      });
      changeOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit load expense</DialogTitle>
          <DialogDescription>
            This row comes from the linked load. Saving here updates the load and its profit
            automatically.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <form id={`load-expense-form-${expense.id}`} onSubmit={submit} noValidate>
            <Field
              label={categoryLabel(expense.category)}
              htmlFor={`load-expense-amount-${expense.id}`}
              required
              error={error}
              hint="Set the amount to 0 to remove this cost from the expense ledger."
            >
              <Input
                id={`load-expense-amount-${expense.id}`}
                type="number"
                inputMode="decimal"
                min={0}
                max={1_000_000}
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                aria-invalid={Boolean(error)}
                autoFocus
                required
              />
            </Field>
          </form>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => changeOpen(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={`load-expense-form-${expense.id}`}
            size="sm"
            disabled={pending}
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
