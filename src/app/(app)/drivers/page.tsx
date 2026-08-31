import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DriverFormDialog } from "@/components/drivers/driver-form-dialog";
import { DriverRowActions } from "@/components/drivers/driver-row-actions";
import { MiniStat } from "@/components/dashboard/mini-stat";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { calculateDriverPay, driverPayDescription, driverSettlementTotals, unsettledLoadsForDriver } from "@/lib/driver-pay";
import { formatMoney, formatNumber } from "@/lib/formatters";
import { hasFleetAccess } from "@/lib/plans";
import { roleCan } from "@/lib/roles";
import { Users } from "lucide-react";

export const metadata: Metadata = { title: "Drivers" };

export default async function DriversPage() {
  const session = await requireSession();
  const dataset = await getRepository(session.businessId).getDataset();
  if (!hasFleetAccess(dataset.subscription)) redirect("/truck");
  const canManage = roleCan(session.role ?? "VIEWER", "manage_drivers");
  const active = dataset.drivers.filter((driver) => driver.active);
  const unsettled = dataset.drivers.flatMap((driver) =>
    unsettledLoadsForDriver(dataset.loads, dataset.driverSettlements, driver.id),
  );
  const outstandingPay = dataset.drivers.reduce((total, driver) =>
    total + unsettledLoadsForDriver(dataset.loads, dataset.driverSettlements, driver.id)
      .reduce((sum, load) => sum + calculateDriverPay(driver.payType, driver.payRate, load), 0), 0);
  const paid = dataset.driverSettlements
    .filter((settlement) => settlement.status === "PAID")
    .reduce((sum, settlement) => sum + driverSettlementTotals(settlement).payAmount, 0);

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title="Drivers"
        description="Assign operational pay terms once, then attach each load to the person who ran it."
        actions={canManage ? <DriverFormDialog trucks={dataset.trucks} /> : null}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat label="Active drivers" value={formatNumber(active.length)} />
        <MiniStat label="Unsettled loads" value={formatNumber(unsettled.length)} />
        <MiniStat label="Estimated unpaid" value={formatMoney(outstandingPay)} tone="warning" />
        <MiniStat label="Statements paid" value={formatMoney(paid)} tone="positive" />
      </div>
      <Card>
        <CardContent className="p-0">
          {dataset.drivers.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No drivers yet"
              description="Add the first driver, choose a pay method, then assign loads to them."
              action={canManage ? <DriverFormDialog trucks={dataset.trucks} /> : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Driver</TableHead><TableHead>Default unit</TableHead><TableHead>Pay agreement</TableHead>
                  <TableHead className="text-right">Unsettled</TableHead><TableHead className="text-right">Estimated pay</TableHead>
                  <TableHead>Status</TableHead>{canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow></TableHeader>
                <TableBody>{dataset.drivers.map((driver) => {
                  const loads = unsettledLoadsForDriver(dataset.loads, dataset.driverSettlements, driver.id);
                  const due = loads.reduce((sum, load) => sum + calculateDriverPay(driver.payType, driver.payRate, load), 0);
                  return <TableRow key={driver.id}>
                    <TableCell><p className="font-medium">{driver.name}</p><p className="text-2xs text-muted-foreground">{driver.reference ?? "No internal reference"}</p></TableCell>
                    <TableCell>{dataset.trucks.find((truck) => truck.id === driver.defaultTruckId)?.name ?? "Any unit"}</TableCell>
                    <TableCell>{driverPayDescription(driver)}</TableCell>
                    <TableCell className="text-right tnum">{loads.length}</TableCell>
                    <TableCell className="text-right tnum">{formatMoney(due)}</TableCell>
                    <TableCell><Badge variant={driver.active ? "positive" : "default"}>{driver.active ? "Active" : "Inactive"}</Badge></TableCell>
                    {canManage ? <TableCell><DriverRowActions driver={driver} trucks={dataset.trucks} /></TableCell> : null}
                  </TableRow>;
                })}</TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-2xs text-muted-foreground">
        OnRoad Books stores names, an optional internal code and pay terms only. It does not store SSNs, bank details or tax-withholding data and is not a payroll processor.
      </p>
    </div>
  );
}
