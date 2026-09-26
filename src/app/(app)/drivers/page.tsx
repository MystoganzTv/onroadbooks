import { PeriodControls } from "@/components/dashboard/period-controls";
import { periodFromSearchParams, type SearchParams } from "@/lib/period-params";
import { loadsInPeriod, roundMoney } from "@/lib/calculations";
import { formatMoney, formatMiles } from "@/lib/formatters";
import type { Metadata } from "next";
import Link from "next/link";

import { DriverFormDialog } from "@/components/drivers/driver-form-dialog";
import { DriverRowActions } from "@/components/drivers/driver-row-actions";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSession } from "@/lib/auth";
import { getDataset } from "@/lib/db";
import { driverPayDescription, driverLoadEarnings } from "@/lib/driver-pay";
import { roleCan } from "@/lib/roles";
import { Users } from "lucide-react";
import { getAppLocale } from "@/lib/i18n-server";
import { getWebDictionary } from "@/lib/i18n/dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).drivers.metadataTitle };
}

export default async function DriversPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const period = periodFromSearchParams(await searchParams);
  const [session, locale] = await Promise.all([requireSession(), getAppLocale()]);
  const copy = getWebDictionary(locale).drivers;
  const common = getWebDictionary(locale).common;
  const dataset = await getDataset(session.businessId);
  const canManage = roleCan(session.role ?? "VIEWER", "manage_drivers");

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={<>
          {canManage ? <DriverFormDialog trucks={dataset.trucks} /> : null}
        </>}
      />
      <PeriodControls period={period} />
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
                  <TableHead className="text-right">{copy.loads}</TableHead><TableHead className="text-right">{copy.miles}</TableHead><TableHead className="text-right">{copy.payFromLoads}</TableHead><TableHead>{copy.status}</TableHead>{canManage ? <TableHead className="text-right">{common.actions}</TableHead> : null}
                </TableRow></TableHeader>
                <TableBody>{dataset.drivers.map((driver) => {
                  const earnings = driverLoadEarnings(driver, loadsInPeriod(dataset.loads, period), dataset.driverSettlements);
                  return <TableRow key={driver.id}>
                    <TableCell><Link href={`/drivers/${driver.id}?period=custom&from=${period.start}&to=${period.end}`} className="font-medium text-primary hover:underline">{driver.name}</Link>{driver.reference ? <p className="text-2xs text-muted-foreground">{driver.reference}</p> : null}</TableCell>
                    <TableCell>{dataset.trucks.find((truck) => truck.id === driver.defaultTruckId)?.name ?? copy.anyUnit}</TableCell>
                    <TableCell>{driverPayDescription(driver, locale)}</TableCell>
                    <TableCell className="text-right tnum">{earnings.length}</TableCell>
                    <TableCell className="text-right tnum">{formatMiles(earnings.reduce((sum, row) => sum + row.load.loadedMiles + row.load.deadheadMiles, 0))}</TableCell>
                    <TableCell className="text-right tnum"><Link href={`/drivers/${driver.id}?period=custom&from=${period.start}&to=${period.end}`} className="font-semibold text-primary hover:underline">{formatMoney(roundMoney(earnings.reduce((sum, row) => sum + row.amount, 0)))}</Link></TableCell>
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
