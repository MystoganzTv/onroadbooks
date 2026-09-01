import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";

import { DriverSettlementActions } from "@/components/driver-settlements/driver-settlement-actions";
import { DriverSettlementFormDialog } from "@/components/driver-settlements/driver-settlement-form-dialog";
import { MiniStat } from "@/components/dashboard/mini-stat";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { calculateDriverPay, driverSettlementTotals, unsettledLoadsForDriver } from "@/lib/driver-pay";
import { formatDateShort, formatMoney, formatNumber } from "@/lib/formatters";
import { hasFleetAccess } from "@/lib/plans";
import { roleCan } from "@/lib/roles";

export const metadata: Metadata = { title: "Driver Settlements" };

export default async function DriverSettlementsPage() {
  const session = await requireSession();
  if (!roleCan(session.role ?? "VIEWER", "manage_driver_settlements")) redirect("/dashboard");
  const dataset = await getRepository(session.businessId).getDataset();
  if (!hasFleetAccess(dataset.subscription)) redirect("/settlements");
  const canManage = true;
  const availableDrivers = dataset.drivers.filter((driver) =>
    unsettledLoadsForDriver(dataset.loads, dataset.driverSettlements, driver.id).length > 0,
  );
  const draftTotal = dataset.driverSettlements.filter((row) => row.status === "DRAFT").reduce((sum, row) => sum + driverSettlementTotals(row).payAmount, 0);
  const paidTotal = dataset.driverSettlements.filter((row) => row.status === "PAID").reduce((sum, row) => sum + driverSettlementTotals(row).payAmount, 0);
  const unsettledLoads = dataset.drivers.flatMap((driver) => unsettledLoadsForDriver(dataset.loads, dataset.driverSettlements, driver.id));
  const estimated = dataset.drivers.reduce((total, driver) => total + unsettledLoadsForDriver(dataset.loads, dataset.driverSettlements, driver.id).reduce((sum, load) => sum + calculateDriverPay(driver.payType, driver.payRate, load), 0), 0);

  return <div className="space-y-4 p-4 lg:p-6">
    <PageHeader title="Driver Settlements" description="Prepare pay from assigned loads, review the frozen statement, then post it to the right loads and units." actions={canManage ? <DriverSettlementFormDialog drivers={availableDrivers} /> : null} />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MiniStat label="Unsettled loads" value={formatNumber(unsettledLoads.length)} />
      <MiniStat label="Estimated unprepared" value={formatMoney(estimated)} tone="warning" />
      <MiniStat label="Draft pay" value={formatMoney(draftTotal)} />
      <MiniStat label="Paid statements" value={formatMoney(paidTotal)} tone="positive" />
    </div>
    <Card><CardContent className="p-0">
      {dataset.driverSettlements.length === 0 ? <EmptyState icon={ClipboardList} title="No driver statements yet" description={dataset.drivers.length === 0 ? "Add a driver and assign them to loads first." : "Assign loads to a driver, then prepare a statement for their date range."} action={canManage && availableDrivers.length > 0 ? <DriverSettlementFormDialog drivers={availableDrivers} /> : undefined} /> : <div className="overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Driver</TableHead><TableHead className="text-right">Loads</TableHead><TableHead className="text-right">Trucks</TableHead><TableHead className="text-right">Gross moved</TableHead><TableHead className="text-right">Driver pay</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
        <TableBody>{dataset.driverSettlements.map((settlement) => {
          const total = driverSettlementTotals(settlement);
          const driver = dataset.drivers.find((row) => row.id === settlement.driverId);
          return <TableRow key={settlement.id}>
            <TableCell><Link href={`/driver-settlements/${settlement.id}`} className="font-medium text-primary hover:underline">{formatDateShort(settlement.periodStart)} – {formatDateShort(settlement.periodEnd)}</Link></TableCell>
            <TableCell>{driver?.name ?? "Unknown driver"}</TableCell><TableCell className="text-right tnum">{total.loads}</TableCell><TableCell className="text-right tnum">{new Set(settlement.lines.map((line) => line.truckId)).size}</TableCell><TableCell className="text-right tnum">{formatMoney(total.grossRevenue)}</TableCell><TableCell className="text-right tnum font-semibold">{formatMoney(total.payAmount)}</TableCell>
            <TableCell><Badge variant={settlement.status === "PAID" ? "positive" : "warning"}>{settlement.status === "PAID" ? `Paid ${formatDateShort(settlement.paidOn!)}` : "Draft"}</Badge></TableCell>
            <TableCell><DriverSettlementActions settlement={settlement} /></TableCell>
          </TableRow>;
        })}</TableBody>
      </Table></div>}
    </CardContent></Card>
    <p className="text-2xs text-muted-foreground">Preparing a draft does not change profit. Marking it paid creates the operating expenses on the selected payment date and adds the frozen amount to each load’s profitability.</p>
  </div>;
}
