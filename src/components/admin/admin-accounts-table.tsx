"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ChevronDown,
  Eye,
  FileText,
  Fuel,
  Gift,
  Loader2,
  MoreHorizontal,
  ReceiptText,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  Truck,
  WalletCards,
  Wrench,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  adminDeleteAccount,
  adminEndComplimentaryAccess,
  adminGrantComplimentaryFleet,
  adminGrantComplimentaryPro,
  adminResetAccountData,
} from "@/lib/actions/admin";
import type { AdminAccountSummary } from "@/lib/db/repository";
import { getPlan } from "@/lib/plans";

type OperationKind = "grant-pro" | "grant-fleet" | "end" | "reset" | "delete";
type AdminAccountRow = AdminAccountSummary & { isPlatformAdmin: boolean };
type Operation = { kind: OperationKind; account: AdminAccountRow } | null;

const ACCESS_LABELS: Record<AdminAccountSummary["accessSource"], string> = {
  stripe: "Stripe",
  complimentary: "Complimentary",
  trial: "Trial",
  inactive: "Inactive",
};

function statusVariant(status: AdminAccountSummary["subscriptionStatus"]) {
  if (status === "ACTIVE") return "positive" as const;
  if (status === "PAST_DUE") return "negative" as const;
  if (status === "TRIALING") return "info" as const;
  return "outline" as const;
}

function accessVariant(source: AdminAccountSummary["accessSource"]) {
  if (source === "complimentary") return "positive" as const;
  if (source === "stripe") return "default" as const;
  if (source === "trial") return "info" as const;
  return "outline" as const;
}

function dateLabel(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
}

function relativeDate(value: string | null, now: string): string {
  if (!value) return "No product activity yet";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "No product activity yet";
  const days = Math.max(0, Math.floor((Date.parse(now) - timestamp) / 86_400_000));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

function adoptedModules(account: AdminAccountSummary): number {
  return [
    account.counts.loads,
    account.counts.expenses,
    account.counts.fuelEntries,
    account.counts.documents,
    account.counts.maintenance,
    account.counts.reserveTransactions,
    account.counts.settlements,
  ].filter((count) => count > 0).length;
}

function operationTitle(kind: OperationKind): string {
  if (kind === "grant-pro") return "Grant complimentary Pro?";
  if (kind === "grant-fleet") return "Grant complimentary Fleet?";
  if (kind === "end") return "End complimentary access?";
  if (kind === "reset") return "Reset this workspace?";
  return "Delete this account?";
}

function operationMessage(kind: OperationKind): string {
  if (kind === "grant-pro") {
    return "This grants OnRoad Pro immediately without creating a Stripe subscription or charge. The access remains active until you end it here.";
  }
  if (kind === "grant-fleet") {
    return "This grants OnRoad Fleet immediately, including multi-truck tools and per-unit reporting, without creating a Stripe subscription or charge. The access remains active until you end it here.";
  }
  if (kind === "end") {
    return "Complimentary write access ends immediately and the workspace becomes read-only. Existing records and reports remain visible; subscribing restores write access.";
  }
  if (kind === "reset") {
    return "All ledger records and uploaded documents will be permanently removed. Login, business name, and billing remain.";
  }
  return "The login, workspace, records, documents, and Supabase identity will be permanently removed.";
}

function UsageItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-surface-sunken/25 p-3">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-2xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

export function AdminAccountsTable({
  accounts,
  now,
}: {
  accounts: AdminAccountRow[];
  now: string;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [details, setDetails] = React.useState<AdminAccountSummary | null>(null);
  const [operation, setOperation] = React.useState<Operation>(null);
  const [confirmation, setConfirmation] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return accounts;
    return accounts.filter((account) =>
      [
        account.email,
        account.name,
        account.businessName,
        getPlan(account.plan).name,
        ACCESS_LABELS[account.accessSource],
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle)),
    );
  }, [accounts, query]);

  function closeOperation() {
    if (pending) return;
    setOperation(null);
    setConfirmation("");
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!operation) return;
    startTransition(async () => {
      let result;
      if (operation.kind === "grant-pro") {
        result = await adminGrantComplimentaryPro(operation.account.userId);
      } else if (operation.kind === "grant-fleet") {
        result = await adminGrantComplimentaryFleet(operation.account.userId);
      } else if (operation.kind === "end") {
        result = await adminEndComplimentaryAccess(operation.account.userId);
      } else if (operation.kind === "reset") {
        result = await adminResetAccountData(operation.account.userId, confirmation);
      } else {
        result = await adminDeleteAccount(operation.account.userId, confirmation);
      }
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const successMessage: Record<OperationKind, string> = {
        "grant-pro": "Complimentary Pro granted",
        "grant-fleet": "Complimentary Fleet granted",
        end: "Complimentary access ended",
        reset: "Account data reset",
        delete: "Account deleted",
      };
      toast.success(successMessage[operation.kind]);
      setOperation(null);
      setConfirmation("");
      router.refresh();
    });
  }

  const expected = operation
    ? operation.kind === "reset"
      ? `RESET ${operation.account.email}`
      : operation.kind === "delete"
        ? operation.account.email
        : ""
    : "";
  const needsTypedConfirmation = operation?.kind === "reset" || operation?.kind === "delete";
  const confirmed = Boolean(operation && (!needsTypedConfirmation || confirmation.trim() === expected));

  return (
    <>
      <div className="rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold">Accounts</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {filtered.length} of {accounts.length} owners · usage metadata only
            </p>
          </div>
          <div className="relative sm:ml-auto sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search account, plan, or access"
              className="pl-9"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-surface-sunken/60 text-2xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Owner</th>
                <th className="px-4 py-3 font-semibold">Access</th>
                <th className="px-4 py-3 font-semibold">Engagement</th>
                <th className="px-4 py-3 font-semibold">Last activity</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 text-right font-semibold">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((account) => {
                const destructiveActionsProtected = account.isPlatformAdmin;
                const modules = adoptedModules(account);
                const complimentaryPro =
                  account.accessSource === "complimentary" && account.plan === "OWNER";
                const complimentaryFleet =
                  account.accessSource === "complimentary" && account.plan === "FLEET";
                return (
                  <tr key={account.userId} className="align-top hover:bg-surface-sunken/25">
                    <td className="px-4 py-4">
                      <div className="flex items-start gap-2.5">
                        {destructiveActionsProtected ? <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /> : null}
                        <div className="min-w-0">
                          <p className="max-w-[240px] truncate font-medium text-foreground">{account.businessName}</p>
                          <p className="mt-0.5 max-w-[240px] truncate text-xs text-muted-foreground">{account.email}</p>
                          {account.name ? <p className="mt-0.5 text-2xs text-muted-foreground">{account.name}</p> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium">{getPlan(account.plan).name}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Badge variant={statusVariant(account.subscriptionStatus)}>
                          {account.subscriptionStatus.replace("_", " ")}
                        </Badge>
                        <Badge variant={accessVariant(account.accessSource)}>
                          {ACCESS_LABELS[account.accessSource]}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">{account.counts.loads} loads · {account.counts.expenses} expenses</p>
                      <p className="mt-1">{modules} of 7 product areas used</p>
                    </td>
                    <td className="px-4 py-4 text-xs text-muted-foreground">
                      <p className={account.lastActivityAt ? "font-medium text-foreground" : ""}>
                        {relativeDate(account.lastActivityAt, now)}
                      </p>
                      {account.lastActivityAt ? <p className="mt-1 text-2xs">{dateLabel(account.lastActivityAt)}</p> : null}
                    </td>
                    <td className="px-4 py-4 text-xs text-muted-foreground">{dateLabel(account.createdAt)}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setDetails(account)}>
                          <Eye /> Details
                        </Button>

                        {!account.hasProviderSubscription ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="outline">
                                <Gift /> Access <ChevronDown className="size-3.5 opacity-60" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              {!complimentaryPro ? (
                                <DropdownMenuItem onSelect={() => setOperation({ kind: "grant-pro", account })}>
                                  <Gift className="size-4" /> Grant Pro
                                </DropdownMenuItem>
                              ) : null}
                              {!complimentaryFleet ? (
                                <DropdownMenuItem onSelect={() => setOperation({ kind: "grant-fleet", account })}>
                                  <Truck className="size-4" /> Grant Fleet
                                </DropdownMenuItem>
                              ) : null}
                              {account.accessSource === "complimentary" ? (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onSelect={() => setOperation({ kind: "end", account })}>
                                    End complimentary access
                                  </DropdownMenuItem>
                                </>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" aria-label={`More actions for ${account.businessName}`}>
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem
                              disabled={destructiveActionsProtected}
                              onSelect={() => setOperation({ kind: "reset", account })}
                            >
                              <RotateCcw className="size-4" /> Reset workspace data
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={destructiveActionsProtected || account.hasProviderSubscription}
                              title={account.hasProviderSubscription ? "Cancel Stripe billing first" : undefined}
                              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                              onSelect={() => setOperation({ kind: "delete", account })}
                            >
                              <Trash2 className="size-4" /> Delete account
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
          Usage details exclude revenue, rates, routes, vendors, notes, file contents, and document names.
          Stripe-managed accounts must be changed through billing.
        </div>
      </div>

      <Dialog open={details !== null} onOpenChange={(open) => !open && setDetails(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{details?.businessName}</DialogTitle>
            <DialogDescription>
              Product adoption and workspace volume. No financial totals or record contents.
            </DialogDescription>
          </DialogHeader>
          {details ? (
            <DialogBody className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <UsageItem icon={Activity} label="Last activity" value={relativeDate(details.lastActivityAt, now)} />
                <UsageItem icon={WalletCards} label="Access source" value={ACCESS_LABELS[details.accessSource]} />
                <UsageItem icon={Eye} label="Product adoption" value={`${adoptedModules(details)} / 7 areas`} />
              </div>

              <div>
                <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Workspace volume</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <UsageItem icon={Truck} label="Trucks" value={`${details.counts.activeTrucks} active / ${details.counts.trucks} total`} />
                  <UsageItem icon={ReceiptText} label="Loads" value={details.counts.loads} />
                  <UsageItem icon={WalletCards} label="Expenses" value={details.counts.expenses} />
                  <UsageItem icon={Fuel} label="Fuel entries" value={details.counts.fuelEntries} />
                  <UsageItem icon={FileText} label="Documents" value={details.counts.documents} />
                  <UsageItem icon={Wrench} label="Maintenance" value={details.counts.maintenance} />
                  <UsageItem icon={Activity} label="Reserve moves" value={details.counts.reserveTransactions} />
                  <UsageItem icon={ShieldCheck} label="Settlements" value={details.counts.settlements} />
                </div>
              </div>

              <div className="grid gap-3 rounded-md border border-border bg-surface-sunken/25 p-3 text-xs sm:grid-cols-3">
                <div>
                  <p className="text-2xs uppercase tracking-wider text-muted-foreground">Plan</p>
                  <p className="mt-1 font-medium">{getPlan(details.plan).name}</p>
                </div>
                <div>
                  <p className="text-2xs uppercase tracking-wider text-muted-foreground">Period / trial ends</p>
                  <p className="mt-1 font-medium">{dateLabel(details.currentPeriodEnd)}</p>
                </div>
                <div>
                  <p className="text-2xs uppercase tracking-wider text-muted-foreground">Account created</p>
                  <p className="mt-1 font-medium">{dateLabel(details.createdAt)}</p>
                </div>
              </div>
            </DialogBody>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDetails(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={operation !== null} onOpenChange={(open) => !open && closeOperation()}>
        <DialogContent className="max-w-md">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{operation ? operationTitle(operation.kind) : "Account action"}</DialogTitle>
              <DialogDescription>
                {operation?.account.businessName} · {operation?.account.email}
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-3">
              {operation ? (
                <p className={`rounded-md border p-3 text-xs leading-relaxed text-muted-foreground ${
                  operation.kind === "grant-pro" || operation.kind === "grant-fleet"
                    ? "border-pos/25 bg-pos/[0.04]"
                    : "border-destructive/25 bg-destructive/[0.04]"
                }`}>
                  {operationMessage(operation.kind)}
                </p>
              ) : null}
              {needsTypedConfirmation ? (
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
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeOperation} disabled={pending}>Cancel</Button>
              <Button
                type="submit"
                variant={operation?.kind === "grant-pro" || operation?.kind === "grant-fleet" ? "default" : "destructive"}
                disabled={!confirmed || pending}
              >
                {pending ? <Loader2 className="animate-spin" /> : null}
                {operation?.kind === "grant-pro"
                  ? "Grant Pro"
                  : operation?.kind === "grant-fleet"
                    ? "Grant Fleet"
                  : operation?.kind === "end"
                    ? "End complimentary access"
                    : operation?.kind === "reset"
                      ? "Reset permanently"
                      : "Delete permanently"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
