"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createReserveTransactionAction } from "@/lib/actions/reserves";
import { fieldErrors, focusFirstError, validationMessage } from "@/lib/form";
import { reserveTransactionSchema } from "@/lib/schemas";
import { todayISO } from "@/lib/periods";
import type { ReserveAccount, ReserveTransactionType } from "@/lib/types";
import { toNumber } from "@/lib/utils";

const FIELD_LABELS: Record<string, string> = {
  accountId: "Bucket",
  date: "Date",
  type: "Movement",
  amount: "Amount",
  description: "Description",
};

const TYPES: { value: ReserveTransactionType; label: string; hint: string }[] = [
  { value: "CONTRIBUTION", label: "Contribution", hint: "Money set aside into the bucket" },
  { value: "WITHDRAWAL", label: "Withdrawal", hint: "Money taken out to pay for something" },
  { value: "ADJUSTMENT", label: "Adjustment", hint: "A correction, either direction" },
];

/** Record a movement in a bucket by hand. Contributions also post automatically when a settlement closes. */
export function ReserveTransactionDialog({
  accounts,
  defaultAccountId,
  trigger,
}: {
  accounts: ReserveAccount[];
  defaultAccountId?: string;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const [accountId, setAccountId] = React.useState(defaultAccountId ?? accounts[0]?.id ?? "");
  const [date, setDate] = React.useState(todayISO());
  const [type, setType] = React.useState<ReserveTransactionType>("CONTRIBUTION");
  const [amount, setAmount] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [negative, setNegative] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setAccountId(defaultAccountId ?? accounts[0]?.id ?? "");
    setDate(todayISO());
    setType("CONTRIBUTION");
    setAmount("");
    setDescription("");
    setNegative(false);
    setErrors({});
  }, [open, defaultAccountId, accounts]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      accountId,
      date,
      type,
      amount: toNumber(amount),
      description,
      negative: type === "ADJUSTMENT" ? negative : false,
    };

    const parsed = reserveTransactionSchema.safeParse(payload);
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors(next);
      toast.error(validationMessage(next, FIELD_LABELS));
      requestAnimationFrame(() => focusFirstError("reserve-txn-form"));
      return;
    }

    setErrors({});
    startTransition(async () => {
      const result = await createReserveTransactionAction(payload);
      if (result.ok) {
        toast.success("Movement recorded");
        setOpen(false);
        router.refresh();
      } else {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus className="size-4" />
            Record movement
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <form id="reserve-txn-form" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Record a reserve movement</DialogTitle>
            <DialogDescription>
              These buckets are a planning ledger. Nothing here moves money in a bank account.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-3">
            <Field label="Bucket" htmlFor="txn-account" required error={errors.accountId}>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id="txn-account">
                  <SelectValue placeholder="Pick a bucket" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Movement" htmlFor="txn-type" required error={errors.type}>
              <Select
                value={type}
                onValueChange={(value) => setType(value as ReserveTransactionType)}
              >
                <SelectTrigger id="txn-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {type === "ADJUSTMENT" ? (
              <div className="flex gap-2" role="group" aria-label="Adjustment direction">
                {[
                  { value: false, label: "Increase" },
                  { value: true, label: "Decrease" },
                ].map((option) => (
                  <Button
                    key={String(option.value)}
                    type="button"
                    size="sm"
                    variant={negative === option.value ? "default" : "outline"}
                    aria-pressed={negative === option.value}
                    onClick={() => setNegative(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" htmlFor="txn-date" required error={errors.date}>
                <Input
                  id="txn-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
              <Field label="Amount" htmlFor="txn-amount" required error={errors.amount}>
                <Input
                  id="txn-amount"
                  inputMode="decimal"
                  placeholder="240.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
            </div>

            <Field
              label="Description"
              htmlFor="txn-description"
              required
              error={errors.description}
              hint="What this covers, e.g. Oil change paid from reserve"
            >
              <Input
                id="txn-description"
                maxLength={200}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Record movement
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
