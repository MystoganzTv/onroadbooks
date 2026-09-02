import type { Metadata } from "next";
import Link from "next/link";
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
import { getAppLocale } from "@/lib/i18n-server";
import { getWebDictionary } from "@/lib/i18n/dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).drivers.metadataTitle };
}

export default async function DriversPage() {
  const [session, locale] = await Promise.all([requireSession(), getAppLocale()]);
  const copy = getWebDictionary(locale).drivers;
  const common = getWebDictionary(locale).common;
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
        title={copy.title}
        description={copy.description}
        actions={canManage ? <DriverFormDialog trucks={dataset.trucks} /> : null}
      />
      <div className="rounded-lg border border-info/30 bg-info-soft/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">
          {copy.accessNoticeTitle}
        </span>{" "}
        {copy.accessNoticeBody}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat label={copy.activeDrivers} value={formatNumber(active.length)} />
        <MiniStat label={copy.unsettledLoads} value={formatNumber(unsettled.length)} />
        <MiniStat label={copy.estimatedUnpaid} value={formatMoney(outstandingPay)} tone="warning" />
        <MiniStat label={copy.statementsPaid} value={formatMoney(paid)} tone="positive" />
      </div>
      <Card>
        <CardContent className="p-0">
          {dataset.drivers.length === 0 ? (
            <EmptyState
              icon={Users}
              title={copy.noDrivers}
              description={copy.noDriversDescription}
              action={canManage ? <DriverFormDialog trucks={dataset.trucks} /> : undefined}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{copy.driver}</TableHead><TableHead>{copy.defaultUnit}</TableHead><TableHead>{copy.payAgreement}</TableHead>
                  <TableHead className="text-right">{copy.unsettled}</TableHead><TableHead className="text-right">{copy.estimatedPay}</TableHead>
                  <TableHead>{copy.status}</TableHead>{canManage ? <TableHead className="text-right">{common.actions}</TableHead> : null}
                </TableRow></TableHeader>
                <TableBody>{dataset.drivers.map((driver) => {
                  const loads = unsettledLoadsForDriver(dataset.loads, dataset.driverSettlements, driver.id);
                  const due = loads.reduce((sum, load) => sum + calculateDriverPay(driver.payType, driver.payRate, load), 0);
                  return <TableRow key={driver.id}>
                    <TableCell><Link href={`/drivers/${driver.id}`} className="font-medium text-primary hover:underline">{driver.name}</Link><p className="text-2xs text-muted-foreground">{driver.reference ?? copy.noReference}</p></TableCell>
                    <TableCell>{dataset.trucks.find((truck) => truck.id === driver.defaultTruckId)?.name ?? copy.anyUnit}</TableCell>
                    <TableCell>{driverPayDescription(driver, locale)}</TableCell>
                    <TableCell className="text-right tnum">{loads.length}</TableCell>
                    <TableCell className="text-right tnum">{formatMoney(due)}</TableCell>
                    <TableCell><Badge variant={driver.active ? "positive" : "default"}>{driver.active ? common.active : common.inactive}</Badge></TableCell>
                    {canManage ? <TableCell><DriverRowActions driver={driver} trucks={dataset.trucks} /></TableCell> : null}
                  </TableRow>;
                })}</TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <p className="text-2xs text-muted-foreground">
        {copy.privacyNote}
      </p>
    </div>
  );
}
