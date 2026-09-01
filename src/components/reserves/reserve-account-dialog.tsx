"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus } from "lucide-react";
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
import {
  createReserveAccountAction,
  updateReserveAccountAction,
} from "@/lib/actions/reserves";
import { fieldErrors, focusFirstError, validationMessage } from "@/lib/form";
import { reserveAccountSchema } from "@/lib/schemas";
import type { ReserveAccount, ReserveBasis } from "@/lib/types";
import { toNumber } from "@/lib/utils";

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  basis: "Charged against",
  contributionPct: "Contribution",
  targetBalance: "Target balance",
};

/**
 * Add or edit a bucket.
 *
 * The tax and maintenance buckets are built in: their percentages live in
 * Settings so a reserve rate is stored once, and this dialog says so rather
 * than showing a field that would not be saved.
 */
export function ReserveAccountDialog({
  account,
  trigger,
}: {
  account?: ReserveAccount;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const builtIn = account?.kind === "TAX" || account?.kind === "MAINTENANCE";

  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const [name, setName] = React.useState(account?.name ?? "");
  const [basis, setBasis] = React.useState<ReserveBasis>(account?.basis ?? "GROSS_REVENUE");
  const [pct, setPct] = React.useState(
    account?.contributionPct != null ? String(account.contributionPct) : "",
  );
  const [target, setTarget] = React.useState(
    account?.targetBalance != null ? String(account.targetBalance) : "",
  );

  React.useEffect(() => {
    if (!open) return;
    setName(account?.name ?? "");
    setBasis(account?.basis ?? "GROSS_REVENUE");
    setPct(account?.contributionPct != null ? String(account.contributionPct) : "");
    setTarget(account?.targetBalance != null ? String(account.targetBalance) : "");
    setErrors({});
  }, [open, account]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      kind: account?.kind ?? ("CUSTOM" as const),
      name,
      basis,
      contributionPct: builtIn ? null : pct === "" ? 0 : toNumber(pct),
      targetBalance: target === "" ? null : toNumber(target),
      active: account?.active ?? true,
    };

    const parsed = reserveAccountSchema.safeParse(payload);
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors(next);
      toast.error(validationMessage(next, FIELD_LABELS));
      requestAnimationFrame(() => focusFirstError("reserve-account-form"));
      return;
    }

    setErrors({});
    startTransition(async () => {
      const result = account
        ? await updateReserveAccountAction(account.id, payload)
        : await createReserveAccountAction(payload);

      if (result.ok) {
        toast.success(account ? "Bucket updated" : "Bucket created");
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
          <Button size="sm" variant={account ? "ghost" : "default"}>
            {account ? <Pencil className="size-3.5" /> : <Plus className="size-4" />}
            {account ? "" : "New bucket"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <form id="reserve-account-form" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{account ? "Edit bucket" : "New reserve bucket"}</DialogTitle>
            <DialogDescription>
              Buckets accrue when you close a settlement. They are a planning ledger, not a bank
              account.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-3">
            <Field label="Name" htmlFor="bucket-name" required error={errors.name}>
              <Input
                id="bucket-name"
                maxLength={60}
                placeholder="Emergency Fund"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            <Field label="Charged against" htmlFor="bucket-basis" error={errors.basis}>
              <Select value={basis} onValueChange={(value) => setBasis(value as ReserveBasis)}>
                <SelectTrigger id="bucket-basis">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GROSS_REVENUE">Gross revenue</SelectItem>
                  <SelectItem value="OPERATING_PROFIT">Operating Profit</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {builtIn ? (
              <p className="rounded-md border border-dashed border-border bg-surface-sunken/50 p-3 text-2xs leading-relaxed text-muted-foreground">
                The {account?.name.toLowerCase()} percentage is set on the Settings page, so the
                rate lives in exactly one place. Everything else about this bucket is editable
                here.
              </p>
            ) : (
              <Field
                label="Contribution"
                htmlFor="bucket-pct"
                error={errors.contributionPct}
                hint="Percent taken each time a settlement closes"
              >
                <Input
                  id="bucket-pct"
                  inputMode="decimal"
                  placeholder="2"
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                />
              </Field>
            )}

            <Field
              label="Target balance"
              htmlFor="bucket-target"
              error={errors.targetBalance}
              hint="Optional. Shows a progress bar toward the number."
            >
              <Input
                id="bucket-target"
                inputMode="decimal"
                placeholder="5000"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
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
              {account ? "Save bucket" : "Create bucket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
