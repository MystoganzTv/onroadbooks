import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DriverFormDialog } from "@/components/drivers/driver-form-dialog";
import { DriverRowActions } from "@/components/drivers/driver-row-actions";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSession } from "@/lib/auth";
import { getDataset } from "@/lib/db";
import { driverPayDescription } from "@/lib/driver-pay";
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
  const dataset = await getDataset(session.businessId);
  if (!hasFleetAccess(dataset.subscription)) redirect("/truck");
  const canManage = roleCan(session.role ?? "VIEWER", "manage_drivers");
  const canManagePay = roleCan(session.role ?? "VIEWER", "manage_driver_settlements");

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={<>
          {canManagePay ? <Button asChild variant="outline" size="sm"><Link href="/driver-settlements">{copy.openDriverPay}</Link></Button> : null}
          {canManage ? <DriverFormDialog trucks={dataset.trucks} /> : null}
        </>}
      />
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
                  <TableHead>{copy.status}</TableHead>{canManage ? <TableHead className="text-right">{common.actions}</TableHead> : null}
                </TableRow></TableHeader>
                <TableBody>{dataset.drivers.map((driver) => {
                  return <TableRow key={driver.id}>
                    <TableCell><Link href={`/drivers/${driver.id}`} className="font-medium text-primary hover:underline">{driver.name}</Link>{driver.reference ? <p className="text-2xs text-muted-foreground">{driver.reference}</p> : null}</TableCell>
                    <TableCell>{dataset.trucks.find((truck) => truck.id === driver.defaultTruckId)?.name ?? copy.anyUnit}</TableCell>
                    <TableCell>{driverPayDescription(driver, locale)}</TableCell>
                    <TableCell><Badge variant={driver.active ? "positive" : "default"}>{driver.active ? common.active : common.inactive}</Badge></TableCell>
                    {canManage ? <TableCell><DriverRowActions driver={driver} trucks={dataset.trucks} /></TableCell> : null}
                  </TableRow>;
                })}</TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
