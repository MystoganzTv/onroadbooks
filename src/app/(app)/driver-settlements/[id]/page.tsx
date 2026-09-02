import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DriverSettlementActions } from "@/components/driver-settlements/driver-settlement-actions";
import {
  DeleteDriverSettlementAdjustmentButton,
  DriverSettlementAdjustmentDialog,
} from "@/components/driver-settlements/driver-settlement-adjustments";
import { DriverSettlementExport } from "@/components/driver-settlements/driver-settlement-export";
import { MiniStat } from "@/components/dashboard/mini-stat";
import { HistoryBackButton } from "@/components/shared/history-back-button";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSession } from "@/lib/auth";
import { getDataset } from "@/lib/db";
import { DRIVER_ADJUSTMENT_TYPES, DRIVER_PAY_TYPES, driverSettlementTotals } from "@/lib/driver-pay";
import { formatMiles, formatMoney, formatRateValue } from "@/lib/formatters";
import { hasFleetAccess } from "@/lib/plans";
import { roleCan } from "@/lib/roles";
import { getAppLocale } from "@/lib/i18n-server";
import { getWebDictionary, interpolate } from "@/lib/i18n/dictionaries";
import { formatLocaleDate } from "@/lib/i18n-format";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).driverPay.statementMetadataTitle };
}

export default async function DriverSettlementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session, locale] = await Promise.all([params, requireSession(), getAppLocale()]);
  const dictionary = getWebDictionary(locale);
  const copy = dictionary.driverPay;
  if (!roleCan(session.role ?? "VIEWER", "manage_driver_settlements")) redirect("/dashboard");
  const dataset = await getDataset(session.businessId);
  if (!hasFleetAccess(dataset.subscription)) redirect("/settlements");
  const settlement = dataset.driverSettlements.find((row) => row.id === id);
  if (!settlement) notFound();
  const driver = dataset.drivers.find((row) => row.id === settlement.driverId);
  const totals = driverSettlementTotals(settlement);
  const statementYear = (settlement.paidOn ?? settlement.periodEnd).slice(0, 4);
  const ytdPaid = dataset.driverSettlements
    .filter((row) => row.driverId === settlement.driverId && row.status === "PAID" && row.paidOn?.startsWith(statementYear))
    .reduce((sum, row) => sum + driverSettlementTotals(row).netPay, 0);
  const canManage = true;

  return <div className="space-y-4 p-4 lg:p-6">
    <HistoryBackButton
      fallbackHref="/driver-settlements"
      label={copy.back}
      className="print:hidden"
    />
    <PageHeader
      title={copy.statementTitle}
      description={interpolate(copy.statementPeriod, { driver: driver?.name ?? copy.unknownDriver, start: formatLocaleDate(settlement.periodStart, locale, { weekday: "short", month: "short", day: "numeric", year: "numeric" }), end: formatLocaleDate(settlement.periodEnd, locale, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) })}
      actions={<><DriverSettlementExport id={settlement.id} />{canManage ? <DriverSettlementActions settlement={settlement} showView={false} /> : null}</>}
    />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MiniStat label={copy.grossHauled} value={formatMoney(totals.grossRevenue)} sub={`${totals.loads} ${totals.loads === 1 ? copy.load : copy.loads}`} />
      <MiniStat label={copy.miles} value={formatMiles(totals.totalMiles)} sub={`${formatRateValue(totals.payPerMile)}/mi`} />
      <MiniStat label={copy.netPay} value={formatMoney(totals.netPay)} tone={settlement.status === "PAID" ? "positive" : "warning"} sub={`${formatMoney(totals.payPerLoad)}/${copy.load}`} />
      <MiniStat label={interpolate(copy.ytdPaid, { year: statementYear })} value={formatMoney(ytdPaid)} sub={settlement.status === "DRAFT" ? copy.beforeDraft : copy.includingStatement} />
    </div>

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.55fr)]">
    <Card>
      <CardHeader><div><CardTitle>{copy.loadsOnStatement}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{copy.frozenDescription}</p></div><Badge variant={settlement.status === "PAID" ? "positive" : "warning"}>{settlement.status === "PAID" ? interpolate(copy.paidDate, { date: formatLocaleDate(settlement.paidOn!, locale, { month: "short", day: "numeric" }) }) : copy.draft}</Badge></CardHeader>
      <CardContent className="p-0"><div className="overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>{copy.pickup}</TableHead><TableHead>{copy.load}</TableHead><TableHead>{copy.truck}</TableHead><TableHead>{copy.payBasis}</TableHead><TableHead className="text-right">{copy.gross}</TableHead><TableHead className="text-right">{copy.miles}</TableHead><TableHead className="text-right">{copy.pay}</TableHead></TableRow></TableHeader>
        <TableBody>{settlement.lines.map((line) => {
          const load = dataset.loads.find((row) => row.id === line.loadId);
          const truck = dataset.trucks.find((row) => row.id === line.truckId);
          const method = DRIVER_PAY_TYPES.find((type) => type.id === line.payType)!;
          return <TableRow key={line.id}>
            <TableCell>{load ? formatLocaleDate(load.date, locale, { month: "short", day: "numeric" }) : "—"}</TableCell>
            <TableCell>{load ? <Link href={`/loads/${load.id}`} className="font-medium text-primary hover:underline">{load.originCity}, {load.originState} → {load.destinationCity}, {load.destinationState}</Link> : copy.loadUnavailable}<p className="text-2xs text-muted-foreground">{load?.loadNumber ? `#${load.loadNumber}` : line.loadId}</p></TableCell>
            <TableCell>{truck?.name ?? copy.unknownUnit}</TableCell>
            <TableCell>{line.payType === "PERCENT_GROSS" ? interpolate(copy.percentGross, { rate: line.payRate }) : line.payType === "FLAT_PER_LOAD" ? interpolate(copy.perLoad, { rate: formatMoney(line.payRate) }) : `${formatMoney(line.payRate)} ${locale === "es" ? method.suffixEs : method.suffix}`}</TableCell>
            <TableCell className="text-right tnum">{formatMoney(line.grossRevenue)}</TableCell><TableCell className="text-right tnum">{formatMiles(line.totalMiles)}</TableCell><TableCell className="text-right tnum font-semibold">{formatMoney(line.payAmount)}</TableCell>
          </TableRow>;
        })}</TableBody>
      </Table></div></CardContent>
    </Card>

    <Card className="h-fit">
      <CardHeader>
        <div><CardTitle>{copy.paySummary}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{copy.payFlow}</p></div>
        {canManage && settlement.status === "DRAFT" ? <DriverSettlementAdjustmentDialog settlementId={settlement.id} /> : null}
      </CardHeader>
      <CardContent className="p-0">
        <dl className="divide-y divide-border/70 text-sm">
          <PayRow label={copy.baseLoadPay} value={totals.basePay} />
          <PayRow label={copy.accessorialPay} value={totals.accessorialPay} positive />
          <PayRow label={copy.otherEarnings} value={totals.otherEarnings} positive />
          <PayRow label={copy.grossPay} value={totals.basePay + totals.accessorialPay + totals.otherEarnings} strong />
          <PayRow label={copy.reimbursements} value={totals.reimbursements} positive />
          <PayRow label={copy.deductions} value={totals.deductions} negative />
          <PayRow label={copy.advances} value={totals.advances} negative />
        </dl>
        <div className="flex items-end justify-between gap-3 border-t-2 border-primary/35 bg-primary/5 px-4 py-4">
          <div><p className="label-xs">{copy.netPay}</p><p className="mt-1 text-2xs text-muted-foreground">{copy.amountDue}</p></div>
          <p className="tnum text-3xl font-semibold tracking-tight text-primary">{formatMoney(totals.netPay)}</p>
        </div>
      </CardContent>
    </Card>
    </div>

    {settlement.adjustments.length > 0 ? <Card>
      <CardHeader><div><CardTitle>{copy.adjustments}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{copy.adjustmentDescription}</p></div></CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border/70">
          {settlement.adjustments.map((adjustment) => {
            const definition = DRIVER_ADJUSTMENT_TYPES.find((option) => option.id === adjustment.type)!;
            const negative = definition.direction === "SUBTRACT";
            return <li key={adjustment.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0"><p className="text-sm font-medium">{locale === "es" ? definition.labelEs : definition.label}</p><p className="truncate text-xs text-muted-foreground">{adjustment.reason}</p></div>
              <div className="flex shrink-0 items-center gap-2"><span className={negative ? "tnum font-semibold text-neg" : "tnum font-semibold text-pos"}>{negative ? "−" : "+"}{formatMoney(adjustment.amount)}</span><DeleteDriverSettlementAdjustmentButton settlement={settlement} adjustmentId={adjustment.id} /></div>
            </li>;
          })}
        </ul>
      </CardContent>
    </Card> : null}
    {settlement.notes ? <Card><CardHeader><CardTitle>{copy.notes}</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap text-sm">{settlement.notes}</p></CardContent></Card> : null}
    <p className="text-2xs text-muted-foreground">{copy.operationalDisclaimer} {settlement.status === "PAID" ? interpolate(copy.postedOn, { date: formatLocaleDate(settlement.paidOn!, locale, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) }) : copy.notPosted}</p>
  </div>;
}

function PayRow({ label, value, positive, negative, strong }: { label: string; value: number; positive?: boolean; negative?: boolean; strong?: boolean }) {
  const amountClass = value > 0 && negative ? "tnum text-neg" : value > 0 && positive ? "tnum text-pos" : "tnum";
  return <div className={strong ? "flex items-center justify-between bg-surface-sunken/50 px-4 py-3 font-semibold" : "flex items-center justify-between px-4 py-2.5"}>
    <dt className="text-muted-foreground">{label}</dt>
    <dd className={amountClass}>{negative && value > 0 ? "−" : positive && value > 0 ? "+" : ""}{formatMoney(value)}</dd>
  </div>;
}
