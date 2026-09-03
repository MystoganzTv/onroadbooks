import type { Metadata } from "next";
import Link from "next/link";
import { BadgeDollarSign, Building2, CalendarDays, Truck as TruckIcon } from "lucide-react";

import {
  EditFinancialObligationButton,
  FinancialObligationDialog,
} from "@/components/financing/financial-obligation-dialog";
import { MiniStat } from "@/components/dashboard/mini-stat";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { getDataset } from "@/lib/db";
import { formatMoney, formatMoneyCompact } from "@/lib/formatters";
import { formatLocaleDate } from "@/lib/i18n-format";
import { getWebDictionary, interpolate } from "@/lib/i18n/dictionaries";
import { getAppLocale } from "@/lib/i18n-server";
import { roleCan } from "@/lib/roles";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).financing.metadataTitle };
}

export default async function FinancingPage() {
  const [session, locale] = await Promise.all([requireSession(), getAppLocale()]);
  const copy = getWebDictionary(locale).financing;
  const { financialObligations, expenses, trucks } = await getDataset(session.businessId);
  const canManage = roleCan(session.role ?? "VIEWER", "manage_finances");
  const active = financialObligations.filter((obligation) => obligation.active);
  const monthlyCommitment = active.reduce(
    (total, obligation) => total + (obligation.expectedMonthlyPayment ?? 0),
    0,
  );
  const linkedExpenses = expenses.filter((expense) => expense.obligationId);
  const paymentKeys = new Set(
    linkedExpenses.map((expense) => expense.splitGroupId ?? expense.id),
  );
  const unclassified = expenses.filter(
    (expense) =>
      expense.category === "TRUCK_PAYMENT"
      && (expense.financialTreatment ?? "DEBT_UNALLOCATED") === "DEBT_UNALLOCATED",
  );
  const ordered = financialObligations.toSorted((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1;
    return left.name.localeCompare(right.name);
  });

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={canManage ? <FinancialObligationDialog trucks={trucks} /> : undefined}
      />

      {!canManage ? (
        <p className="rounded-lg border border-border bg-surface-sunken px-4 py-3 text-xs text-muted-foreground">
          {copy.readOnly}
        </p>
      ) : null}

      <section aria-label={copy.title} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat label={copy.activeObligations} value={String(active.length)} />
        <MiniStat label={copy.monthlyCommitment} value={formatMoneyCompact(monthlyCommitment)} tone="negative" />
        <MiniStat label={copy.recordedPayments} value={String(paymentKeys.size)} />
        <MiniStat
          label={copy.unclassifiedPayments}
          value={String(unclassified.length)}
          tone={unclassified.length > 0 ? "warning" : "neutral"}
        />
      </section>

      {unclassified.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn/35 bg-warn-soft/35 px-4 py-3">
          <p className="text-xs font-medium text-warn">{copy.unclassifiedPayments}: {unclassified.length}</p>
          <Button asChild size="sm" variant="outline">
            <Link href="/expenses?review=debt">{copy.reviewPayments}</Link>
          </Button>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{copy.allObligations}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {ordered.length === 0 ? (
            <EmptyState
              icon={BadgeDollarSign}
              title={copy.noObligations}
              description={copy.noObligationsDescription}
              action={canManage ? <FinancialObligationDialog trucks={trucks} /> : undefined}
            />
          ) : (
            <div className="divide-y divide-border">
              {ordered.map((obligation) => {
                const truck = trucks.find((candidate) => candidate.id === obligation.truckId);
                const obligationExpenses = linkedExpenses.filter(
                  (expense) => expense.obligationId === obligation.id,
                );
                const transactionCount = new Set(
                  obligationExpenses.map((expense) => expense.splitGroupId ?? expense.id),
                ).size;
                const paidToDate = obligationExpenses.reduce(
                  (total, expense) => total + expense.amount,
                  0,
                );
                const typeLabel = obligation.kind === "LOAN"
                  ? copy.loan
                  : obligation.kind === "OPERATING_LEASE"
                    ? copy.operatingLease
                    : copy.unknown;
                return (
                  <article key={obligation.id} className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-sm font-semibold">{obligation.name}</h2>
                        <Badge variant={obligation.active ? "positive" : "outline"}>
                          {obligation.active ? copy.active : copy.closed}
                        </Badge>
                        <Badge variant="info">{typeLabel}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {obligation.counterparty ?? copy.noLender}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          {truck ? <TruckIcon className="size-3" /> : <Building2 className="size-3" />}
                          {truck?.name ?? copy.businessWide}
                        </span>
                        {obligation.startedOn ? (
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="size-3" />
                            {interpolate(copy.started, { date: formatLocaleDate(obligation.startedOn, locale) })}
                          </span>
                        ) : null}
                        {obligation.endedOn ? (
                          <span>{interpolate(copy.closedOn, { date: formatLocaleDate(obligation.endedOn, locale) })}</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs lg:block lg:space-y-1">
                      <div>
                        <p className="font-semibold tnum">
                          {obligation.expectedMonthlyPayment != null
                            ? formatMoney(obligation.expectedMonthlyPayment)
                            : "—"}
                        </p>
                        <p className="text-2xs text-muted-foreground">
                          {obligation.expectedMonthlyPayment != null
                            ? interpolate(copy.monthlyExpected, { amount: formatMoney(obligation.expectedMonthlyPayment) })
                            : copy.noMonthlyAmount}
                        </p>
                      </div>
                      <div>
                        <p className="font-semibold tnum">
                          {interpolate(copy.linkedTransactions, {
                            count: transactionCount,
                            unit: transactionCount === 1 ? copy.transaction : copy.transactions,
                          })}
                        </p>
                        <p className="text-2xs text-muted-foreground">
                          {interpolate(copy.paidToDate, { amount: formatMoney(paidToDate) })}
                        </p>
                      </div>
                    </div>
                    {canManage ? (
                      <div className="justify-self-end">
                        <EditFinancialObligationButton
                          obligation={obligation}
                          trucks={trucks}
                          kindLocked={transactionCount > 0}
                        />
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
