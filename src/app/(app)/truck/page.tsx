import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileText, Gauge, TruckIcon } from "lucide-react";

import { MiniStat } from "@/components/dashboard/mini-stat";
import { DocumentList } from "@/components/documents/document-list";
import { DocumentUploader } from "@/components/documents/document-uploader";
import { MaintenanceFormDialog } from "@/components/maintenance/maintenance-form-dialog";
import { MaintenanceTable } from "@/components/maintenance/maintenance-table";
import { UpcomingMaintenance } from "@/components/maintenance/upcoming-maintenance";
import { TruckHealthPanel } from "@/components/cockpit/truck-health-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Metric } from "@/components/shared/metric";
import { PageHeader } from "@/components/shared/page-header";
import { TruckForm } from "@/components/truck/truck-form";
import { TruckDialog } from "@/components/fleet/truck-dialog";
import { TruckRetireButton } from "@/components/fleet/truck-retire-button";
import { TruckSwitcher } from "@/components/fleet/truck-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { summarizeFuel, truckLifetime } from "@/lib/calculations";
import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { activeTrucks, orderedTrucks, primaryTruck, truckById } from "@/lib/fleet";
import { truckAllowance } from "@/lib/plans";
import { truckFromSearchParams, type SearchParams } from "@/lib/period-params";
import { thresholdsFrom, upcomingMaintenance } from "@/lib/maintenance";
import { calculateMaintenanceHealth } from "@/lib/finance/maintenance-health";
import { calculateReserveBalances, reserveBalanceFor } from "@/lib/finance/reserves";
import { todayISO } from "@/lib/periods";
import {
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatOdometer,
  formatRate,
} from "@/lib/formatters";

export const metadata: Metadata = { title: "Truck" };

export default async function TruckPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const session = await requireSession();
  const dataset = await getRepository(session.businessId).getDataset();

  // One unit at a time: miles remaining and reserve coverage are facts about a
  // specific odometer, not about a fleet.
  const trucks = orderedTrucks(dataset.trucks);
  const selectedId = truckFromSearchParams(params, trucks);
  const truck = truckById(trucks, selectedId) ?? primaryTruck(trucks);
  const lifetime = truckLifetime(dataset, truck);
  const fuel = summarizeFuel(
    dataset.fuelEntries.filter((entry) => entry.truckId === truck.id),
    lifetime.totalMiles,
  );

  const today = todayISO();
  const thresholds = thresholdsFrom(dataset.settings);
  const records = dataset.maintenanceRecords.filter((r) => r.truckId === truck.id);
  const upcoming = upcomingMaintenance(records, truck, today, thresholds);
  const truckDocuments = dataset.documents.filter((doc) => doc.truckId === truck.id);
  const overdue = upcoming.filter((item) => item.status === "OVERDUE").length;
  const dueSoon = upcoming.filter((item) => item.status === "DUE_SOON").length;

  // Can the maintenance bucket actually pay for what is coming?
  const balances = calculateReserveBalances(dataset.reserveAccounts, dataset.reserveTransactions);
  const health = calculateMaintenanceHealth(
    records,
    truck,
    today,
    thresholds,
    reserveBalanceFor(balances, "MAINTENANCE")?.balance ?? 0,
  );

  const description = [truck.year, truck.make, truck.model].filter(Boolean).join(" ");

  // What the plan actually allows, checked against the units that exist. The
  // add button reads this; the server action checks it again on submit,
  // because a hidden button is a suggestion and the limit is a rule.
  const running = activeTrucks(trucks).length;
  const allowance = truckAllowance(dataset.subscription, running);
  const isFleet = trucks.length > 1;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title={truck.name}
        description={description || "Add the year, make and model to complete this profile."}
        actions={
          <>
            {overdue > 0 ? (
              <Badge variant="negative">
                {overdue} overdue {overdue === 1 ? "service" : "services"}
              </Badge>
            ) : dueSoon > 0 ? (
              <Badge variant="warning">{dueSoon} approaching</Badge>
            ) : null}
            <Badge variant={truck.active ? "positive" : "outline"}>
              {truck.active ? "Active" : "Retired"}
            </Badge>
            <MaintenanceFormDialog currentOdometer={truck.currentOdometer} truckId={truck.id} />
          </>
        }
      />

      {isFleet ? (
        <div className="flex flex-wrap items-center gap-2">
          {/* This page reports one unit's odometer, service and documents, so
              there is no whole-fleet view to offer. */}
          <TruckSwitcher trucks={trucks} selectedId={truck.id} includeAll={false} />
          <Button asChild variant="outline" size="sm">
            <Link href="/fleet">
              Compare units
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      ) : null}

      <section
        aria-label="Lifetime economics"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
      >
        <MiniStat
          label="Total Revenue"
          value={formatMoneyCompact(lifetime.totalRevenue)}
          tone="info"
          sub={`${lifetime.loadCount} loads`}
        />
        <MiniStat
          label="Total Expenses"
          value={formatMoneyCompact(lifetime.totalExpenses)}
          tone="negative"
        />
        <MiniStat
          label="Lifetime Profit"
          value={formatMoneyCompact(lifetime.lifetimeProfit)}
          tone={lifetime.lifetimeProfit >= 0 ? "positive" : "negative"}
        />
        <MiniStat label="Total Miles" value={formatNumber(lifetime.totalMiles)} sub="from loads" />
        <MiniStat
          label="Cost / Mile"
          value={formatRate(lifetime.costPerMile)}
          tone="negative"
        />
        <MiniStat
          label="Profit / Mile"
          value={formatRate(lifetime.profitPerMile)}
          tone={lifetime.profitPerMile >= 0 ? "positive" : "negative"}
        />
      </section>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="maintenance">
            Maintenance
            {overdue > 0 ? <span className="ml-1.5 text-neg">{overdue}</span> : null}
          </TabsTrigger>
          <TabsTrigger value="documents">
            Documents
            {truckDocuments.length > 0 ? (
              <span className="ml-1.5 text-muted-foreground">{truckDocuments.length}</span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="maintenance" className="mt-4 space-y-4">
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="min-w-0 space-y-4 xl:col-span-1">
              <TruckHealthPanel health={health} />
              <UpcomingMaintenance items={upcoming} currentOdometer={truck.currentOdometer} />
            </div>
            <div className="min-w-0 xl:col-span-2">
              <MaintenanceTable
                records={records}
                documents={dataset.documents}
                truckId={truck.id}
                currentOdometer={truck.currentOdometer}
                today={today}
                thresholds={thresholds}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="size-3.5 text-muted-foreground" />
                <CardTitle>Truck Documents</CardTitle>
              </div>
              <span className="text-2xs text-muted-foreground">
                Registration, insurance, title, inspections
              </span>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              {truckDocuments.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nothing filed against this truck yet.
                </p>
              ) : (
                <DocumentList documents={truckDocuments} />
              )}
              <DocumentUploader owner="TRUCK" entityId={truck.id} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overview" className="mt-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <TruckForm truck={truck} />
        </div>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Gauge className="size-3.5 text-muted-foreground" />
                <CardTitle>Odometer & Fuel</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 p-4">
              <Metric label="Starting" value={formatOdometer(truck.startingOdometer)} sub="mi" />
              <Metric label="Current" value={formatOdometer(truck.currentOdometer)} sub="mi" />
              <Metric
                label="Miles Driven"
                value={formatNumber(lifetime.odometerMiles)}
                sub="since purchase"
              />
              <Metric
                label="Lifetime MPG"
                value={fuel.milesPerGallon ? fuel.milesPerGallon.toFixed(1) : "--"}
                sub={fuel.milesPerGallon ? "tank to tank" : "needs 2 readings"}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TruckIcon className="size-3.5 text-muted-foreground" />
                <CardTitle>Ownership</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 p-4">
              <Metric
                label="Purchase Price"
                value={truck.purchasePrice ? formatMoney(truck.purchasePrice) : "--"}
              />
              <Metric
                label="Monthly Payment"
                value={truck.monthlyPayment ? formatMoney(truck.monthlyPayment) : "--"}
              />
              <Metric
                label="Monthly Insurance"
                value={truck.monthlyInsurance ? formatMoney(truck.monthlyInsurance) : "--"}
              />
              <Metric label="VIN" value={truck.vin ?? "--"} valueClassName="text-xs font-mono" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <TruckIcon className="size-3.5 text-muted-foreground" />
                <CardTitle>Fleet</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              <p className="text-xs text-muted-foreground">
                {`Running ${running} of the ${allowance.limit} ${allowance.limit === 1 ? "truck" : "trucks"} your plan covers.`}
              </p>
              {allowance.reason ? (
                <p className="text-2xs leading-relaxed text-muted-foreground">
                  {allowance.reason}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <TruckDialog canAdd={allowance.canAdd} limitReason={allowance.reason} />
                {/* Retiring the only truck you have would leave nothing to
                    book work against, so it is offered only once there is a
                    second one. */}
                {running > 1 || !truck.active ? (
                  <TruckRetireButton truck={truck} canRestore={allowance.canAdd} />
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
