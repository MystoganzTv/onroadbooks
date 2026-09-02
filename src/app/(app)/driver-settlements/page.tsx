import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { CalendarDays, CheckCircle2, ClipboardCheck, Clock3, type LucideIcon } from "lucide-react";

import { DriverSettlementActions } from "@/components/driver-settlements/driver-settlement-actions";
import { DriverSettlementFormDialog } from "@/components/driver-settlements/driver-settlement-form-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { calculateDriverPay, driverSettlementTotals, unsettledLoadsForDriver } from "@/lib/driver-pay";
import { formatMoney, formatRateValue } from "@/lib/formatters";
import { hasFleetAccess } from "@/lib/plans";
import { param, periodFromSearchParams, type SearchParams } from "@/lib/period-params";
import { roleCan } from "@/lib/roles";
import type { Driver, DriverSettlement } from "@/lib/types";
import { getAppLocale } from "@/lib/i18n-server";
import { getWebDictionary, interpolate, type WebDictionary } from "@/lib/i18n/dictionaries";
import { formatLocaleDate, localeTag } from "@/lib/i18n-format";
import type { AppLocale } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).driverPay.metadataTitle };
}

export default async function DriverSettlementsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [params, session, locale] = await Promise.all([searchParams, requireSession(), getAppLocale()]);
  const copy = getWebDictionary(locale).driverPay;
  if (!roleCan(session.role ?? "VIEWER", "manage_driver_settlements")) redirect("/dashboard");
  const dataset = await getRepository(session.businessId).getDataset();
  if (!hasFleetAccess(dataset.subscription)) redirect("/settlements");

  const period = periodFromSearchParams(params);
  const requestedDriver = param(params, "driver", "all");
  const driverId = dataset.drivers.some((driver) => driver.id === requestedDriver) ? requestedDriver : null;
  const visibleDrivers = driverId
    ? dataset.drivers.filter((driver) => driver.id === driverId)
    : dataset.drivers;

  const needsPreparation = visibleDrivers.flatMap((driver) => {
    const loads = unsettledLoadsForDriver(dataset.loads, dataset.driverSettlements, driver.id)
      .filter((load) => load.date >= period.start && load.date <= period.end);
    if (loads.length === 0) return [];
    const estimated = loads.reduce(
      (sum, load) => sum + calculateDriverPay(driver.payType, driver.payRate, load),
      0,
    );
    return [{ driver, loads, estimated }];
  });

  const inView = dataset.driverSettlements.filter((statement) =>
    (!driverId || statement.driverId === driverId) &&
    statement.periodEnd >= period.start && statement.periodStart <= period.end,
  );
  // An unpaid draft is an action queue, not history. Never hide money waiting
  // for review just because the owner changed the reporting period.
  const drafts = dataset.driverSettlements.filter((statement) =>
    statement.status === "DRAFT" && (!driverId || statement.driverId === driverId),
  );
  const paid = inView.filter((statement) => statement.status === "PAID");
  const nextPayroll = needsPreparation.reduce((sum, row) => sum + row.estimated, 0);
  const draftTotal = drafts.reduce((sum, row) => sum + driverSettlementTotals(row).netPay, 0);
  const paidTotal = paid.reduce((sum, row) => sum + driverSettlementTotals(row).netPay, 0);

  return <div className="space-y-5 p-4 lg:p-6">
    <PageHeader
      title={copy.title}
      description={copy.description}
      actions={<DriverSettlementFormDialog drivers={dataset.drivers.filter((driver) => driver.active)} defaultDriverId={driverId ?? undefined} defaultPeriodStart={period.start} defaultPeriodEnd={period.end} />}
    />

    <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
      <input type="hidden" name="period" value="custom" />
      <label className="min-w-48 flex-1 text-xs font-medium text-muted-foreground">{copy.driver}
        <select name="driver" defaultValue={driverId ?? "all"} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-ring">
          <option value="all">{copy.allDrivers}</option>
          {dataset.drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium text-muted-foreground">{copy.from}<Input name="from" type="date" defaultValue={period.start} className="mt-1 w-40" /></label>
      <label className="text-xs font-medium text-muted-foreground">{copy.to}<Input name="to" type="date" defaultValue={period.end} className="mt-1 w-40" /></label>
      <Button type="submit" variant="outline" size="sm">{copy.apply}</Button>
    </form>

    <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card">
      <CardContent className="grid gap-4 p-5 md:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))] md:items-center">
        <div><p className="label-xs">{copy.nextPayroll}</p><p className="mt-1 text-3xl font-semibold tracking-tight tnum">{formatMoney(nextPayroll)}</p><p className="mt-1 text-xs text-muted-foreground">{interpolate(copy.readyThrough, { date: formatLocaleDate(period.end, locale) })}</p></div>
        <WorkflowMetric icon={Clock3} label={copy.needsPreparation} value={formatMoney(nextPayroll)} sub={`${needsPreparation.reduce((sum, row) => sum + row.loads.length, 0)} ${copy.loads}`} />
        <WorkflowMetric icon={ClipboardCheck} label={copy.draftsToReview} value={formatMoney(draftTotal)} sub={`${drafts.length} ${drafts.length === 1 ? copy.statement : copy.statements}`} />
        <WorkflowMetric icon={CheckCircle2} label={copy.paid} value={formatMoney(paidTotal)} sub={`${paid.length} ${paid.length === 1 ? copy.statement : copy.statements}`} />
      </CardContent>
    </Card>

    <WorkflowSection number="1" title={copy.needsPreparation} description={copy.preparationDescription} count={needsPreparation.length}>
      {needsPreparation.length === 0 ? <WorkflowEmpty text={copy.noPreparation} /> : <div className="divide-y divide-border/70">
        {needsPreparation.map(({ driver, loads, estimated }) => {
          const miles = loads.reduce((sum, load) => sum + load.loadedMiles + load.deadheadMiles, 0);
          return <div key={driver.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><Link href={`/drivers/${driver.id}`} className="font-semibold text-foreground hover:text-primary">{driver.name}</Link><p className="mt-0.5 text-xs text-muted-foreground">{interpolate(copy.unsettledSummary, { loads: loads.length, loadUnit: loads.length === 1 ? copy.load : copy.loads, miles: miles.toLocaleString(localeTag(locale)), average: formatMoney(estimated / loads.length) })}</p></div>
            <div className="flex items-center justify-between gap-3 sm:justify-end"><p className="tnum text-lg font-semibold text-warn">{formatMoney(estimated)}</p><DriverSettlementFormDialog drivers={[driver]} defaultDriverId={driver.id} defaultPeriodStart={period.start} defaultPeriodEnd={period.end} /></div>
          </div>;
        })}
      </div>}
    </WorkflowSection>

    <WorkflowSection number="2" title={copy.draftsToReview} description={copy.draftsDescription} count={drafts.length}>
      {drafts.length === 0 ? <WorkflowEmpty text={copy.noDrafts} /> : <StatementRows statements={drafts} drivers={dataset.drivers} locale={locale} copy={copy} />}
    </WorkflowSection>

    <WorkflowSection number="3" title={copy.paid} description={copy.paidDescription} count={paid.length}>
      {paid.length === 0 ? <WorkflowEmpty text={copy.noPaid} /> : <StatementRows statements={paid} drivers={dataset.drivers} locale={locale} copy={copy} />}
    </WorkflowSection>
  </div>;
}

function WorkflowMetric({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: string; sub: string }) {
  return <div className="rounded-lg border border-border/80 bg-background/45 p-3"><div className="flex items-center gap-2 text-muted-foreground"><Icon className="size-4" /><span className="text-2xs font-semibold uppercase tracking-wider">{label}</span></div><p className="mt-2 tnum text-xl font-semibold">{value}</p><p className="text-2xs text-muted-foreground">{sub}</p></div>;
}

function WorkflowSection({ number, title, description, count, children }: { number: string; title: string; description: string; count: number; children: ReactNode }) {
  return <Card><CardHeader><div className="flex items-center gap-3"><span className="flex size-7 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">{number}</span><div><CardTitle>{title}</CardTitle><p className="mt-0.5 text-xs text-muted-foreground">{description}</p></div></div><Badge>{count}</Badge></CardHeader><CardContent className="p-0">{children}</CardContent></Card>;
}

function WorkflowEmpty({ text }: { text: string }) {
  return <div className="flex items-center gap-3 p-5 text-sm text-muted-foreground"><CheckCircle2 className="size-5 text-pos" />{text}</div>;
}

function StatementRows({ statements, drivers, locale, copy }: { statements: DriverSettlement[]; drivers: Driver[]; locale: AppLocale; copy: WebDictionary["driverPay"] }) {
  return <div className="divide-y divide-border/70">{statements.map((statement) => {
    const totals = driverSettlementTotals(statement);
    const driver = drivers.find((row) => row.id === statement.driverId);
    return <div key={statement.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(6rem,0.55fr))_auto] sm:items-center">
      <div className="min-w-0"><Link href={`/driver-settlements/${statement.id}`} className="font-semibold text-primary hover:underline">{driver?.name ?? copy.unknownDriver}</Link><p className="mt-0.5 text-xs text-muted-foreground"><CalendarDays className="mr-1 inline size-3" />{formatLocaleDate(statement.periodStart, locale, { month: "short", day: "numeric" })} – {formatLocaleDate(statement.periodEnd, locale, { month: "short", day: "numeric" })}</p></div>
      <SmallMetric label={copy.loads} value={String(totals.loads)} />
      <SmallMetric label={copy.grossHauled} value={formatMoney(totals.grossRevenue)} />
      <SmallMetric label={copy.netPay} value={formatMoney(totals.netPay)} sub={`${formatRateValue(totals.payPerMile)}/mi`} />
      <DriverSettlementActions settlement={statement} />
    </div>;
  })}</div>;
}

function SmallMetric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div><p className="label-xs">{label}</p><p className="mt-0.5 tnum text-sm font-semibold">{value}</p>{sub ? <p className="text-2xs text-muted-foreground">{sub}</p> : null}</div>;
}
