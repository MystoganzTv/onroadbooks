import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Clock3 } from "lucide-react";

import { MiniStat } from "@/components/dashboard/mini-stat";
import { PeriodControls } from "@/components/dashboard/period-controls";
import { DriverSettlementFormDialog } from "@/components/driver-settlements/driver-settlement-form-dialog";
import { HistoryBackButton } from "@/components/shared/history-back-button";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSession } from "@/lib/auth";
import { getDataset } from "@/lib/db";
import { driverLoadEarnings, driverPayDescription, driverSettlementTotals } from "@/lib/driver-pay";
import { formatMiles, formatMoney } from "@/lib/formatters";
import { hasFleetAccess } from "@/lib/plans";
import { periodFromSearchParams, type SearchParams } from "@/lib/period-params";
import { roleCan } from "@/lib/roles";
import { getAppLocale } from "@/lib/i18n-server";
import { getWebDictionary, interpolate } from "@/lib/i18n/dictionaries";
import { formatLocaleDate } from "@/lib/i18n-format";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).drivers.profileMetadataTitle };
}

export default async function DriverProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, query, session, locale] = await Promise.all([params, searchParams, requireSession(), getAppLocale()]);
  const dictionary = getWebDictionary(locale);
  const copy = dictionary.drivers;
  const dataset = await getDataset(session.businessId);
  if (!hasFleetAccess(dataset.subscription)) redirect("/truck");
  const driver = dataset.drivers.find((row) => row.id === id);
  if (!driver) notFound();

  const period = periodFromSearchParams(query);
  const statements = dataset.driverSettlements
    .filter((row) => row.driverId === driver.id)
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
  const periodLoads = dataset.loads.filter((load) => load.date >= period.start && load.date <= period.end);
  const earnings = driverLoadEarnings(driver, periodLoads, dataset.driverSettlements).sort((a, b) => b.load.date.localeCompare(a.load.date));
  const grossHauled = earnings.reduce((sum, row) => sum + row.load.grossRate, 0);
  const miles = earnings.reduce((sum, row) => sum + row.load.loadedMiles + row.load.deadheadMiles, 0);
  const pay = earnings.reduce((sum, row) => sum + row.amount, 0);
  const canPrepare = roleCan(session.role ?? "VIEWER", "manage_driver_settlements");
  const defaultTruck = dataset.trucks.find((truck) => truck.id === driver.defaultTruckId);

  return <div className="space-y-5 p-4 lg:p-6">
    <HistoryBackButton fallbackHref="/drivers" label={copy.backToDrivers} />
    <PageHeader
      title={driver.name}
      description={`${driverPayDescription(driver, locale)} · ${defaultTruck?.name ?? copy.anyUnit}${driver.reference ? ` · ${driver.reference}` : ""}`}
      actions={canPrepare ? <DriverSettlementFormDialog drivers={[driver]} defaultDriverId={driver.id} defaultPeriodStart={period.start} defaultPeriodEnd={period.end} /> : null}
    />
    <PeriodControls period={period} />

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <MiniStat label={copy.payFromLoads} value={formatMoney(pay)} sub={period.shortLabel} />
      <MiniStat label={copy.loads} value={String(earnings.length)} sub={period.shortLabel} />
      <MiniStat label={copy.grossHauled} value={formatMoney(grossHauled)} sub={period.shortLabel} />
      <MiniStat label={copy.miles} value={formatMiles(miles)} sub={period.shortLabel} />
    </div>

    <Card>
      <CardHeader><div><CardTitle>{copy.payByLoad}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{copy.payBasisDescription}</p></div></CardHeader>
      <CardContent className="p-0"><div className="overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>{copy.pickup}</TableHead><TableHead>{copy.load}</TableHead><TableHead>{copy.route}</TableHead><TableHead className="text-right">{copy.gross}</TableHead><TableHead className="text-right">{copy.payFromLoads}</TableHead><TableHead className="text-right">{copy.recordedPaid}</TableHead></TableRow></TableHeader>
        <TableBody>{earnings.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">{dictionary.loads.noLoadsPeriod}</TableCell></TableRow> : earnings.map(({ load, amount, paidAmount, paidOn }) => <TableRow key={load.id}>
          <TableCell>{formatLocaleDate(load.date, locale, { month: "short", day: "numeric" })}</TableCell>
          <TableCell><Link href={`/loads/${load.id}`} className="font-medium text-primary hover:underline">{load.loadNumber ?? load.id}</Link></TableCell>
          <TableCell>{load.originCity}, {load.originState} → {load.destinationCity}, {load.destinationState}</TableCell>
          <TableCell className="text-right tnum">{formatMoney(load.grossRate)}</TableCell><TableCell className="text-right tnum font-semibold">{formatMoney(amount)}</TableCell>
          <TableCell className="text-right tnum">{paidAmount === null ? "—" : <>{formatMoney(paidAmount)}{paidOn ? <p className="text-2xs text-muted-foreground">{formatLocaleDate(paidOn, locale)}</p> : null}</>}</TableCell>
        </TableRow>)}</TableBody>
      </Table></div></CardContent>
    </Card>

    <Card>
      <CardHeader><div><CardTitle>{copy.statementHistory}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{copy.statementHistoryDescription}</p></div><Button asChild variant="outline" size="sm"><Link href={`/driver-settlements?driver=${driver.id}`}>{copy.openDriverPay}</Link></Button></CardHeader>
      <CardContent className="p-0">
        {statements.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">{copy.noStatements}</div> : <div className="divide-y divide-border/70">{statements.map((statement) => {
          const totals = driverSettlementTotals(statement);
          return <Link key={statement.id} href={`/driver-settlements/${statement.id}`} className="grid gap-3 px-4 py-3 transition-colors hover:bg-accent/40 sm:grid-cols-[1fr_repeat(3,minmax(6rem,0.5fr))] sm:items-center">
            <div><p className="font-medium">{formatLocaleDate(statement.periodStart, locale, { month: "short", day: "numeric" })} – {formatLocaleDate(statement.periodEnd, locale, { month: "short", day: "numeric" })}</p><p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">{statement.status === "PAID" ? <CheckCircle2 className="size-3 text-pos" /> : <Clock3 className="size-3 text-warn" />}{statement.status === "PAID" ? interpolate(copy.paidOn, { date: formatLocaleDate(statement.paidOn!, locale, { month: "short", day: "numeric" }) }) : copy.draftToReview}</p></div>
            <HistoryMetric label={copy.grossHauled} value={formatMoney(totals.grossRevenue)} /><HistoryMetric label={copy.loads} value={String(totals.loads)} /><HistoryMetric label={copy.netPay} value={formatMoney(totals.netPay)} />
          </Link>;
        })}</div>}
      </CardContent>
    </Card>

  </div>;
}

function HistoryMetric({ label, value }: { label: string; value: string }) {
  return <div><p className="label-xs">{label}</p><p className="mt-0.5 tnum text-sm font-semibold">{value}</p></div>;
}
