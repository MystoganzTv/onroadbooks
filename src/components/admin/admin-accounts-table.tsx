"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Search, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminDeleteAccount, adminResetAccountData } from "@/lib/actions/admin";
import type { AdminAccountSummary } from "@/lib/db/repository";
import { getPlan } from "@/lib/plans";

type Operation = { kind: "reset" | "delete"; account: AdminAccountSummary } | null;

function statusVariant(status: AdminAccountSummary["subscriptionStatus"]) {
  if (status === "ACTIVE") return "positive" as const;
  if (status === "PAST_DUE") return "negative" as const;
  if (status === "TRIALING") return "info" as const;
  return "outline" as const;
}

function dateLabel(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

export function AdminAccountsTable({ accounts }: { accounts: AdminAccountSummary[] }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [operation, setOperation] = React.useState<Operation>(null);
  const [confirmation, setConfirmation] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return accounts;
    return accounts.filter((account) =>
      [account.email, account.name, account.businessName, getPlan(account.plan).name]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle)),
    );
  }, [accounts, query]);

  function close() {
    if (pending) return;
    setOperation(null);
    setConfirmation("");
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!operation) return;
    startTransition(async () => {
      const result = operation.kind === "reset"
        ? await adminResetAccountData(operation.account.userId, confirmation)
        : await adminDeleteAccount(operation.account.userId, confirmation);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(operation.kind === "reset" ? "Account data reset" : "Account deleted");
      setOperation(null);
      setConfirmation("");
      router.refresh();
    });
  }

  const expected = operation
    ? operation.kind === "reset"
      ? `RESET ${operation.account.email}`
      : operation.account.email
    : "";
  const confirmed = Boolean(operation && confirmation.trim() === expected);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-semibold">Accounts</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {filtered.length} of {accounts.length} owners
          </p>
        </div>
        <div className="relative sm:ml-auto sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search email, business, or plan"
            className="pl-9"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-surface-sunken/60 text-2xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">Owner</th>
              <th className="px-4 py-3 font-semibold">Plan</th>
              <th className="px-4 py-3 font-semibold">Period / trial ends</th>
              <th className="px-4 py-3 font-semibold">Workspace data</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3 text-right font-semibold">Controls</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((account) => {
              const protectedRow = account.isDemo || account.email.toLowerCase() === "enrique.padron853@gmail.com";
              return (
                <tr key={account.userId} className="align-top hover:bg-surface-sunken/25">
                  <td className="px-4 py-4">
                    <div className="flex items-start gap-2.5">
                      {protectedRow ? <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /> : null}
                      <div className="min-w-0">
                        <p className="max-w-[260px] truncate font-medium text-foreground">{account.businessName}</p>
                        <p className="mt-0.5 max-w-[260px] truncate text-xs text-muted-foreground">{account.email}</p>
                        {account.name ? <p className="mt-0.5 text-2xs text-muted-foreground">{account.name}</p> : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-medium">{getPlan(account.plan).name}</p>
                    <Badge className="mt-1.5" variant={statusVariant(account.subscriptionStatus)}>
                      {account.subscriptionStatus.replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-4 text-xs text-muted-foreground">
                    <p>{dateLabel(account.currentPeriodEnd)}</p>
                    <p className="mt-1 text-2xs">
                      {account.hasProviderSubscription ? "Stripe connected" : "No Stripe subscription"}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-xs text-muted-foreground">
                    <p>{account.counts.trucks} truck{account.counts.trucks === 1 ? "" : "s"} · {account.counts.loads} loads</p>
                    <p className="mt-1">{account.counts.expenses} expenses · {account.counts.documents} files</p>
                  </td>
                  <td className="px-4 py-4 text-xs text-muted-foreground">{dateLabel(account.createdAt)}</td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={protectedRow}
                        onClick={() => setOperation({ kind: "reset", account })}
                      >
                        <RotateCcw /> Reset
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={protectedRow || account.hasProviderSubscription}
                        title={account.hasProviderSubscription ? "Cancel Stripe billing first" : undefined}
                        onClick={() => setOperation({ kind: "delete", account })}
                      >
                        <Trash2 /> Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">No accounts match that search.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="border-t border-border px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        Accounts with Stripe billing cannot be deleted here until the subscription is canceled.
        Resetting keeps login and billing but permanently clears the business ledger.
      </div>

      <Dialog open={operation !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-w-md">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{operation?.kind === "reset" ? "Reset this workspace?" : "Delete this account?"}</DialogTitle>
              <DialogDescription>
                {operation?.account.businessName} · {operation?.account.email}
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-3">
              <p className="rounded-md border border-destructive/25 bg-destructive/[0.04] p-3 text-xs leading-relaxed text-muted-foreground">
                {operation?.kind === "reset"
                  ? "All ledger records and uploaded documents will be permanently removed. Login, business name, and billing remain."
                  : "The login, workspace, records, documents, and Supabase identity will be permanently removed."}
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="admin-confirmation">Type <span className="normal-case text-foreground">{expected}</span> to confirm</Label>
                <Input
                  id="admin-confirmation"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={pending}
                  autoFocus
                />
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={pending}>Cancel</Button>
              <Button type="submit" variant="destructive" disabled={!confirmed || pending}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                {operation?.kind === "reset" ? "Reset permanently" : "Delete permanently"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
