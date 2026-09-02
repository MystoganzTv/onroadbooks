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

import { localizedClientError } from "@/lib/i18n/errors";

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
import { useLanguage } from "@/components/shell/language-provider";
import {
  adminDeleteAccount,
  adminEndComplimentaryAccess,
  adminGrantComplimentaryFleet,
  adminGrantComplimentaryPro,
  adminResetAccountData,
} from "@/lib/actions/admin";
import type { AdminAccountSummary } from "@/lib/db/repository";
import { formatLocaleDate } from "@/lib/i18n-format";
import { interpolate, type WebDictionary } from "@/lib/i18n/dictionaries";
import type { AppLocale } from "@/lib/i18n";
import { getPlan } from "@/lib/plans";

type OperationKind = "grant-pro" | "grant-fleet" | "end" | "reset" | "delete";
type AdminAccountRow = AdminAccountSummary & { isPlatformAdmin: boolean };
type Operation = { kind: OperationKind; account: AdminAccountRow } | null;

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

function dateLabel(value: string | null, locale: AppLocale): string {
  if (!value) return "—";
  return formatLocaleDate(value, locale);
}

function relativeDate(value: string | null, now: string, copy: WebDictionary["admin"], common: WebDictionary["common"]): string {
  if (!value) return copy.noProductActivity;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return copy.noProductActivity;
  const days = Math.max(0, Math.floor((Date.parse(now) - timestamp) / 86_400_000));
  if (days === 0) return common.today;
  if (days === 1) return common.yesterday;
  if (days < 30) return interpolate(copy.daysAgo, { count: days });
  const months = Math.floor(days / 30);
  if (months < 12) return interpolate(copy.monthsAgo, { count: months, unit: months === 1 ? copy.month : copy.months });
  const years = Math.floor(months / 12);
  return interpolate(copy.yearsAgo, { count: years, unit: years === 1 ? copy.year : copy.years });
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

function operationTitle(kind: OperationKind, copy: WebDictionary["admin"]): string {
  if (kind === "grant-pro") return copy.grantProTitle;
  if (kind === "grant-fleet") return copy.grantFleetTitle;
  if (kind === "end") return copy.endTitle;
  if (kind === "reset") return copy.resetTitle;
  return copy.deleteTitle;
}

function operationMessage(kind: OperationKind, copy: WebDictionary["admin"]): string {
  if (kind === "grant-pro") return copy.grantProMessage;
  if (kind === "grant-fleet") return copy.grantFleetMessage;
  if (kind === "end") return copy.endMessage;
  if (kind === "reset") return copy.resetMessage;
  return copy.deleteMessage;
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
  const { locale, dictionary } = useLanguage();
  const copy = dictionary.admin;
  const common = dictionary.common;
  const accessLabels = React.useMemo<Record<AdminAccountSummary["accessSource"], string>>(
    () => ({
      stripe: "Stripe",
      complimentary: copy.complimentary,
      trial: copy.trial,
      inactive: copy.inactive,
    }),
    [copy.complimentary, copy.inactive, copy.trial],
  );
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
        accessLabels[account.accessSource],
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle)),
    );
  }, [accounts, query, accessLabels]);

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
        toast.error(localizedClientError(result.error));
        return;
      }
      const successMessage: Record<OperationKind, string> = {
        "grant-pro": copy.grantProSuccess,
        "grant-fleet": copy.grantFleetSuccess,
        end: copy.endSuccess,
        reset: copy.resetSuccess,
        delete: copy.deleteSuccess,
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
            <h2 className="text-base font-semibold">{copy.accounts}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {interpolate(copy.ownersUsageOnly, { shown: filtered.length, total: accounts.length })}
            </p>
          </div>
          <div className="relative sm:ml-auto sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.searchPlaceholder}
              className="pl-9"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-surface-sunken/60 text-2xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">{copy.owner}</th>
                <th className="px-4 py-3 font-semibold">{copy.access}</th>
                <th className="px-4 py-3 font-semibold">{copy.engagement}</th>
                <th className="px-4 py-3 font-semibold">{copy.lastActivity}</th>
                <th className="px-4 py-3 font-semibold">{copy.created}</th>
                <th className="px-4 py-3 text-right font-semibold">{copy.controls}</th>
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
                          {accessLabels[account.accessSource]}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">{interpolate(copy.loadsAndExpenses, { loads: account.counts.loads, expenses: account.counts.expenses })}</p>
                      <p className="mt-1">{interpolate(copy.productAreasUsed, { count: modules })}</p>
                    </td>
                    <td className="px-4 py-4 text-xs text-muted-foreground">
                      <p className={account.lastActivityAt ? "font-medium text-foreground" : ""}>
                        {relativeDate(account.lastActivityAt, now, copy, common)}
                      </p>
                      {account.lastActivityAt ? <p className="mt-1 text-2xs">{dateLabel(account.lastActivityAt, locale)}</p> : null}
                    </td>
                    <td className="px-4 py-4 text-xs text-muted-foreground">{dateLabel(account.createdAt, locale)}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setDetails(account)}>
                          <Eye /> {common.details}
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
                                <Gift className="size-4" /> {copy.grantPro}
                                </DropdownMenuItem>
                              ) : null}
                              {!complimentaryFleet ? (
                                <DropdownMenuItem onSelect={() => setOperation({ kind: "grant-fleet", account })}>
                                <Truck className="size-4" /> {copy.grantFleet}
                                </DropdownMenuItem>
                              ) : null}
                              {account.accessSource === "complimentary" ? (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onSelect={() => setOperation({ kind: "end", account })}>
                                    {copy.endComplimentary}
                                  </DropdownMenuItem>
                                </>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" aria-label={interpolate(copy.moreActions, { business: account.businessName })}>
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem
                              disabled={destructiveActionsProtected}
                              onSelect={() => setOperation({ kind: "reset", account })}
                            >
                              <RotateCcw className="size-4" /> {copy.resetWorkspace}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={destructiveActionsProtected || account.hasProviderSubscription}
                              title={account.hasProviderSubscription ? copy.cancelStripeFirst : undefined}
                              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                              onSelect={() => setOperation({ kind: "delete", account })}
                            >
                              <Trash2 className="size-4" /> {copy.deleteAccount}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">{copy.noMatches}</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="border-t border-border px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          {copy.privacyNote}
        </div>
      </div>

      <Dialog open={details !== null} onOpenChange={(open) => !open && setDetails(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{details?.businessName}</DialogTitle>
            <DialogDescription>
              {copy.adoptionDescription}
            </DialogDescription>
          </DialogHeader>
          {details ? (
            <DialogBody className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <UsageItem icon={Activity} label={copy.lastActivity} value={relativeDate(details.lastActivityAt, now, copy, common)} />
                <UsageItem icon={WalletCards} label={copy.accessSource} value={accessLabels[details.accessSource]} />
                <UsageItem icon={Eye} label={copy.productAdoption} value={interpolate(copy.areas, { count: adoptedModules(details) })} />
              </div>

              <div>
                <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{copy.workspaceVolume}</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <UsageItem icon={Truck} label={copy.trucks} value={interpolate(copy.activeTrucks, { active: details.counts.activeTrucks, total: details.counts.trucks })} />
                  <UsageItem icon={ReceiptText} label={copy.loads} value={details.counts.loads} />
                  <UsageItem icon={WalletCards} label={copy.expenses} value={details.counts.expenses} />
                  <UsageItem icon={Fuel} label={copy.fuelEntries} value={details.counts.fuelEntries} />
                  <UsageItem icon={FileText} label={copy.documents} value={details.counts.documents} />
                  <UsageItem icon={Wrench} label={copy.maintenance} value={details.counts.maintenance} />
                  <UsageItem icon={Activity} label={copy.reserveMoves} value={details.counts.reserveTransactions} />
                  <UsageItem icon={ShieldCheck} label={copy.settlements} value={details.counts.settlements} />
                </div>
              </div>

              <div className="grid gap-3 rounded-md border border-border bg-surface-sunken/25 p-3 text-xs sm:grid-cols-3">
                <div>
                  <p className="text-2xs uppercase tracking-wider text-muted-foreground">{copy.plan}</p>
                  <p className="mt-1 font-medium">{getPlan(details.plan).name}</p>
                </div>
                <div>
                  <p className="text-2xs uppercase tracking-wider text-muted-foreground">{copy.periodTrialEnds}</p>
                  <p className="mt-1 font-medium">{dateLabel(details.currentPeriodEnd, locale)}</p>
                </div>
                <div>
                  <p className="text-2xs uppercase tracking-wider text-muted-foreground">{copy.accountCreated}</p>
                  <p className="mt-1 font-medium">{dateLabel(details.createdAt, locale)}</p>
                </div>
              </div>
            </DialogBody>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDetails(null)}>{common.close}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={operation !== null} onOpenChange={(open) => !open && closeOperation()}>
        <DialogContent className="max-w-md">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{operation ? operationTitle(operation.kind, copy) : copy.accountAction}</DialogTitle>
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
                  {operationMessage(operation.kind, copy)}
                </p>
              ) : null}
              {needsTypedConfirmation ? (
                <div className="space-y-1.5">
                  <Label htmlFor="admin-confirmation">{interpolate(copy.typeToConfirm, { value: expected })}</Label>
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
              <Button type="button" variant="outline" onClick={closeOperation} disabled={pending}>{common.cancel}</Button>
              <Button
                type="submit"
                variant={operation?.kind === "grant-pro" || operation?.kind === "grant-fleet" ? "default" : "destructive"}
                disabled={!confirmed || pending}
              >
                {pending ? <Loader2 className="animate-spin" /> : null}
                {operation?.kind === "grant-pro"
                  ? copy.grantPro
                  : operation?.kind === "grant-fleet"
                    ? copy.grantFleet
                  : operation?.kind === "end"
                    ? copy.endComplimentary
                    : operation?.kind === "reset"
                      ? copy.resetPermanently
                      : copy.deletePermanently}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
