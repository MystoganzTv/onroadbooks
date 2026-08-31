import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { DriverSettlementActions } from "@/components/driver-settlements/driver-settlement-actions";
import { DriverSettlementExport } from "@/components/driver-settlements/driver-settlement-export";
import { MiniStat } from "@/components/dashboard/mini-stat";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { DRIVER_PAY_TYPES, driverSettlementTotals } from "@/lib/driver-pay";
import { formatDateLong, formatDateShort, formatMiles, formatMoney } from "@/lib/formatters";
import { hasFleetAccess } from "@/lib/plans";
import { roleCan } from "@/lib/roles";

export const metadata: Metadata = { title: "Driver Statement" };

export default async function DriverSettlementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const dataset = await getRepository(session.businessId).getDataset();
  if (!hasFleetAccess(dataset.subscription)) redirect("/settlements");
  const settlement = dataset.driverSettlements.find((row) => row.id === id);
  if (!settlement) notFound();
  const driver = dataset.drivers.find((row) => row.id === settlement.driverId);
  const totals = driverSettlementTotals(settlement);
  const canManage = roleCan(session.role ?? "VIEWER", "manage_driver_settlements");

  return <div className="space-y-4 p-4 lg:p-6">
    <Button asChild variant="ghost" size="sm" className="print:hidden"><Link href="/driver-settlements"><ArrowLeft /> All driver statements</Link></Button>
    <PageHeader title={driver?.name ?? "Driver statement"} description={`${formatDateLong(settlement.periodStart)} through ${formatDateLong(settlement.periodEnd)} · ${settlement.lines.length} frozen load${settlement.lines.length === 1 ? "" : "s"}`} actions={<><DriverSettlementExport id={settlement.id} />{canManage ? <DriverSettlementActions settlement={settlement} showView={false} /> : null}</>} />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MiniStat label="Gross moved" value={formatMoney(totals.grossRevenue)} />
      <MiniStat label="Miles" value={formatMiles(totals.totalMiles)} />
      <MiniStat label="Driver pay" value={formatMoney(totals.payAmount)} tone={settlement.status === "PAID" ? "positive" : "warning"} />
      <MiniStat label="Status" value={settlement.status === "PAID" ? "Paid" : "Draft"} sub={settlement.paidOn ? formatDateShort(settlement.paidOn) : "not in ledger yet"} />
    </div>
    <Card>
      <CardHeader><div><CardTitle>Loads on this statement</CardTitle><p className="mt-1 text-xs text-muted-foreground">Amounts and pay terms are frozen from the moment the draft is prepared.</p></div><Badge variant={settlement.status === "PAID" ? "positive" : "warning"}>{settlement.status}</Badge></CardHeader>
      <CardContent className="p-0"><div className="overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>Pickup</TableHead><TableHead>Load</TableHead><TableHead>Truck</TableHead><TableHead>Pay basis</TableHead><TableHead className="text-right">Gross</TableHead><TableHead className="text-right">Miles</TableHead><TableHead className="text-right">Pay</TableHead></TableRow></TableHeader>
        <TableBody>{settlement.lines.map((line) => {
          const load = dataset.loads.find((row) => row.id === line.loadId);
          const truck = dataset.trucks.find((row) => row.id === line.truckId);
          const method = DRIVER_PAY_TYPES.find((type) => type.id === line.payType)!;
          return <TableRow key={line.id}>
            <TableCell>{load ? formatDateShort(load.date) : "—"}</TableCell>
            <TableCell>{load ? <Link href={`/loads/${load.id}`} className="font-medium text-primary hover:underline">{load.originCity}, {load.originState} → {load.destinationCity}, {load.destinationState}</Link> : "Load unavailable"}<p className="text-2xs text-muted-foreground">{load?.loadNumber ? `#${load.loadNumber}` : line.loadId}</p></TableCell>
            <TableCell>{truck?.name ?? "Unknown unit"}</TableCell>
            <TableCell>{line.payType === "PERCENT_GROSS" ? `${line.payRate}% of gross` : line.payType === "FLAT_PER_LOAD" ? `${formatMoney(line.payRate)} per load` : `${formatMoney(line.payRate)} ${method.suffix}`}</TableCell>
            <TableCell className="text-right tnum">{formatMoney(line.grossRevenue)}</TableCell><TableCell className="text-right tnum">{formatMiles(line.totalMiles)}</TableCell><TableCell className="text-right tnum font-semibold">{formatMoney(line.payAmount)}</TableCell>
          </TableRow>;
        })}</TableBody>
      </Table></div></CardContent>
    </Card>
    {settlement.notes ? <Card><CardHeader><CardTitle>Notes</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap text-sm">{settlement.notes}</p></CardContent></Card> : null}
    <p className="text-2xs text-muted-foreground">This is an operational driver-pay statement, not a payroll tax document. {settlement.status === "PAID" ? `Its expenses were posted on ${formatDateLong(settlement.paidOn!)}.` : "It does not affect the P&L until you mark it paid."}</p>
  </div>;
}
