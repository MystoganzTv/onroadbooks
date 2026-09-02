"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";

import { Field } from "@/components/shared/field";
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
import {
  createReserveAccountAction,
  updateReserveAccountAction,
} from "@/lib/actions/reserves";
import { fieldErrors, focusFirstError, validationMessage } from "@/lib/form";
import { reserveAccountSchema } from "@/lib/schemas";
import type { ReserveAccount, ReserveBasis } from "@/lib/types";
import { toNumber } from "@/lib/utils";

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
  const { dictionary } = useLanguage();
  const copy = dictionary.reserves;
  const fieldLabels: Record<string, string> = {
    name: copy.name,
    basis: copy.chargedAgainst,
    contributionPct: copy.contribution,
    targetBalance: copy.targetBalance,
  };
  const builtIn = account?.kind === "TAX" || account?.kind === "MAINTENANCE";
  const displayName = account?.kind === "TAX"
    ? copy.taxReserve
    : account?.kind === "MAINTENANCE"
      ? copy.maintenanceReserve
      : account?.name ?? "";

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
      toast.error(validationMessage(next, fieldLabels));
      requestAnimationFrame(() => focusFirstError("reserve-account-form"));
      return;
    }

    setErrors({});
    startTransition(async () => {
      const result = account
        ? await updateReserveAccountAction(account.id, payload)
        : await createReserveAccountAction(payload);

      if (result.ok) {
        toast.success(account ? copy.bucketUpdated : copy.bucketCreated);
        setOpen(false);
        router.refresh();
      } else {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(localizedClientError(result.error));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant={account ? "ghost" : "default"}>
            {account ? <Pencil className="size-3.5" /> : <Plus className="size-4" />}
            {account ? "" : copy.newBucket}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <form id="reserve-account-form" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{account ? copy.editBucket : copy.newReserveBucket}</DialogTitle>
            <DialogDescription>
              {copy.bucketDescription}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-3">
            <Field label={copy.name} htmlFor="bucket-name" required error={errors.name}>
              <Input
                id="bucket-name"
                maxLength={60}
                placeholder={copy.emergencyFund}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            <Field label={copy.chargedAgainst} htmlFor="bucket-basis" error={errors.basis}>
              <Select value={basis} onValueChange={(value) => setBasis(value as ReserveBasis)}>
                <SelectTrigger id="bucket-basis">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GROSS_REVENUE">{copy.grossRevenue}</SelectItem>
                  <SelectItem value="OPERATING_PROFIT">{copy.operatingProfit}</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {builtIn ? (
              <p className="rounded-md border border-dashed border-border bg-surface-sunken/50 p-3 text-2xs leading-relaxed text-muted-foreground">
                {copy.settingsRate.replace("{name}", displayName.toLowerCase())}
              </p>
            ) : (
              <Field
                label={copy.contribution}
                htmlFor="bucket-pct"
                error={errors.contributionPct}
                hint={copy.contributionHint}
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
              label={copy.targetBalance}
              htmlFor="bucket-target"
              error={errors.targetBalance}
              hint={copy.targetHint}
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
              {dictionary.common.cancel}
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {account ? copy.saveBucket : copy.createBucket}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
