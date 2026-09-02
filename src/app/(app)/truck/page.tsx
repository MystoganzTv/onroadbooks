import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  FileText,
  Settings2,
  TruckIcon,
} from "lucide-react";

import { MiniStat } from "@/components/dashboard/mini-stat";
import { DocumentList } from "@/components/documents/document-list";
import { DocumentUploader } from "@/components/documents/document-uploader";
import { MaintenanceFormDialog } from "@/components/maintenance/maintenance-form-dialog";
import { MaintenanceTable } from "@/components/maintenance/maintenance-table";
import { UpcomingMaintenance } from "@/components/maintenance/upcoming-maintenance";
import { TruckHealthPanel } from "@/components/cockpit/truck-health-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { TruckOverview } from "@/components/truck/truck-overview";
import { TruckDialog } from "@/components/fleet/truck-dialog";
import { TruckSwitcher } from "@/components/fleet/truck-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { summarizeFuel, truckLifetime } from "@/lib/calculations";
import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { activeTrucks, orderedTrucks, primaryTruck, truckById } from "@/lib/fleet";
import { hasFleetAccess, planOf, truckAllowance } from "@/lib/plans";
import { iftaApplicability } from "@/lib/ifta-eligibility";
import { roleCan } from "@/lib/roles";
import { truckFromSearchParams, type SearchParams } from "@/lib/period-params";
import { thresholdsFrom, upcomingMaintenance } from "@/lib/maintenance";
import { calculateMaintenanceHealth } from "@/lib/finance/maintenance-health";
import { calculateReserveBalances, reserveBalanceFor } from "@/lib/finance/reserves";
import { todayISO } from "@/lib/periods";
import { formatMoneyCompact, formatNumber, formatRate } from "@/lib/formatters";
import { getWebDictionary, interpolate } from "@/lib/i18n/dictionaries";
import { getAppLocale } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).truck.metadataTitle };
}

export default async function TruckPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [params, session, locale] = await Promise.all([searchParams, requireSession(), getAppLocale()]);
  const copy = getWebDictionary(locale).truck;
  const ownerPlanning = roleCan(session.role ?? "VIEWER", "manage_owner_finances");
  const dataset = await getRepository(session.businessId).getDataset();

  // One unit at a time: miles remaining and reserve coverage are facts about a
  // specific odometer, not about a fleet.
  const trucks = orderedTrucks(dataset.trucks);
  const fleetAccount = hasFleetAccess(dataset.subscription);
  const primary = primaryTruck(trucks);
  const selectedId = fleetAccount ? truckFromSearchParams(params, trucks) : primary.id;
  const truck = truckById(trucks, selectedId) ?? primary;
  const lifetime = truckLifetime(dataset, truck);
  const fuel = summarizeFuel(
    dataset.fuelEntries.filter((entry) => entry.truckId === truck.id),
    lifetime.totalMiles,
  );

  const today = todayISO();
  const thresholds = thresholdsFrom(dataset.settings);
  const records = dataset.maintenanceRecords.filter((r) => r.truckId === truck.id);
  const upcoming = upcomingMaintenance(records, truck, today, thresholds, locale);
  const truckDocuments = dataset.documents.filter((doc) => doc.truckId === truck.id);
  const overdue = upcoming.filter((item) => item.status === "OVERDUE").length;
  const dueSoon = upcoming.filter((item) => item.status === "DUE_SOON").length;

  // Can the maintenance bucket actually pay for what is coming?
  const balances = ownerPlanning
    ? calculateReserveBalances(dataset.reserveAccounts, dataset.reserveTransactions)
    : [];
  const health = calculateMaintenanceHealth(
    records,
    truck,
    today,
    thresholds,
    reserveBalanceFor(balances, "MAINTENANCE")?.balance ?? 0,
    locale,
  );

  const description = [truck.year, truck.make, truck.model].filter(Boolean).join(" ");
  const profileIncomplete =
    !description ||
    iftaApplicability(truck) === "UNKNOWN" ||
    truck.iftaReportingEnabled == null;
  const hasLifetimeActivity =
    lifetime.loadCount > 0 ||
    lifetime.bookedRevenue !== 0 ||
    lifetime.operatingExpenses !== 0 ||
    lifetime.totalMiles > 0 ||
    lifetime.debtService !== 0 ||
    lifetime.collectedRevenue !== 0;

  // What the plan actually allows, checked against the units that exist. The
  // add button reads this; the server action checks it again on submit,
  // because a hidden button is a suggestion and the limit is a rule.
  const running = activeTrucks(trucks).length;
  const allowance = truckAllowance(dataset.subscription, running);
  const plan = planOf(dataset.subscription);
  const hasSeveralTrucks = fleetAccount && trucks.length > 1;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title={truck.name}
        description={description || copy.addProfile}
        actions={
          <>
            {overdue > 0 ? (
              <Badge variant="negative">
                {interpolate(copy.overdueService, { count: overdue, unit: overdue === 1 ? copy.service : copy.services })}
              </Badge>
            ) : dueSoon > 0 ? (
              <Badge variant="warning">{interpolate(copy.approaching, { count: dueSoon })}</Badge>
            ) : null}
            <Badge
              variant={!truck.active ? "outline" : profileIncomplete ? "warning" : "positive"}
            >
              {!truck.active ? copy.retired : profileIncomplete ? copy.setupIncomplete : copy.active}
            </Badge>
            <MaintenanceFormDialog currentOdometer={truck.currentOdometer} truckId={truck.id} />
          </>
        }
      />

      <section
        aria-labelledby="account-mode-title"
        className="overflow-hidden rounded-xl border border-border bg-card"
      >
        <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between lg:p-5">
          <div className="flex min-w-0 items-start gap-3.5">
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary"
              aria-hidden
            >
              <Building2 className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-primary">
                {copy.accountMode}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h2 id="account-mode-title" className="text-lg font-semibold tracking-tight">
                  {fleetAccount ? copy.fleetAccount : copy.individualAccount}
                </h2>
                <Badge variant="info">{interpolate(copy.plan, { name: plan.name })}</Badge>
              </div>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                {fleetAccount
                  ? copy.fleetDescription
                  : copy.individualDescription}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
            <div className="mr-1 border-r border-border pr-3 text-right">
              <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                {copy.activeTrucks}
              </p>
              <p className="tnum text-sm font-semibold">
                {interpolate(copy.of, { count: running, limit: allowance.limit })}
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/plans">
                <Settings2 className="size-4" />
                {copy.managePlan}
              </Link>
            </Button>
            {fleetAccount ? (
              <TruckDialog canAdd={allowance.canAdd} limitReason={allowance.reason} />
            ) : null}
          </div>
        </div>

        <div className="border-t border-border bg-surface-sunken/50 p-4 lg:px-5">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-foreground">
                {hasSeveralTrucks ? copy.chooseTruck : copy.currentTruck}
              </p>
              <p className="mt-0.5 text-2xs text-muted-foreground">
                {copy.selectedOnly}
              </p>
            </div>
            {hasSeveralTrucks ? (
              <Button asChild variant="ghost" size="sm">
                <Link href="/fleet">
                  {copy.compareUnits}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : null}
          </div>

          {hasSeveralTrucks ? (
            <TruckSwitcher
              trucks={trucks}
              selectedId={truck.id}
              includeAll={false}
              variant="cards"
            />
          ) : (
            <div className="max-w-2xl">
              <div className="flex items-center gap-3 rounded-lg border border-primary bg-primary/10 p-3 shadow-sm">
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
                  aria-hidden
                >
                  <TruckIcon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{truck.name}</p>
                  <p className="mt-0.5 truncate text-2xs text-muted-foreground">
                    {description || copy.detailsNotAdded}
                  </p>
                </div>
                <Badge
                  variant={!truck.active ? "outline" : profileIncomplete ? "warning" : "positive"}
                >
                  {!truck.active
                    ? copy.selectedRetired
                    : profileIncomplete
                      ? copy.selectedIncomplete
                      : copy.selectedActive}
                </Badge>
              </div>
            </div>
          )}
        </div>
      </section>

      {hasLifetimeActivity ? (
        <section
          aria-label={copy.lifetimeEconomics}
          className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8"
        >
          <MiniStat
            label={copy.bookedRevenue}
            value={formatMoneyCompact(lifetime.bookedRevenue)}
            tone="info"
            sub={interpolate(copy.loads, { count: lifetime.loadCount })}
          />
          <MiniStat
            label={copy.businessExpenses}
            value={formatMoneyCompact(lifetime.operatingExpenses)}
            tone="negative"
          />
          <MiniStat
            label={copy.businessMade}
            value={formatMoneyCompact(lifetime.operatingProfit)}
            tone={lifetime.operatingProfit >= 0 ? "positive" : "negative"}
          />
          <MiniStat label={copy.totalMiles} value={formatNumber(lifetime.totalMiles)} sub={copy.fromLoads} />
          <MiniStat
            label={copy.actualCostMile}
            value={formatRate(lifetime.actualCostPerMile)}
            tone="negative"
          />
          <MiniStat
            label={copy.profitMile}
            value={formatRate(lifetime.operatingProfitPerMile)}
            tone={lifetime.operatingProfitPerMile >= 0 ? "positive" : "negative"}
          />
          <MiniStat label={copy.debtPayments} value={formatMoneyCompact(lifetime.debtService)} tone="negative" />
          <MiniStat
            label={copy.cashAfterDebt}
            value={formatMoneyCompact(lifetime.cashAfterDebtService)}
            sub={interpolate(copy.collected, { amount: formatMoneyCompact(lifetime.collectedRevenue) })}
            tone={lifetime.cashAfterDebtService >= 0 ? "positive" : "negative"}
          />
        </section>
      ) : (
        <Card>
          <CardContent className="flex items-start gap-3 p-4 lg:p-5">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
              aria-hidden
            >
              <TruckIcon className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">{copy.noHistory}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {copy.noHistoryDescription}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{copy.overview}</TabsTrigger>
          <TabsTrigger value="maintenance">
            {copy.maintenance}
            {overdue > 0 ? <span className="ml-1.5 text-neg">{overdue}</span> : null}
          </TabsTrigger>
          <TabsTrigger value="documents">
            {copy.documents}
            {truckDocuments.length > 0 ? (
              <span className="ml-1.5 text-muted-foreground">{truckDocuments.length}</span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="maintenance" className="mt-4 space-y-4">
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="min-w-0 space-y-4 xl:col-span-1">
              <TruckHealthPanel health={health} showReserve={ownerPlanning} />
              <UpcomingMaintenance
                items={upcoming}
                currentOdometer={truck.currentOdometer}
                thresholds={thresholds}
              />
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
                <CardTitle>{copy.truckDocuments}</CardTitle>
              </div>
              <span className="text-2xs text-muted-foreground">
                {copy.documentTypes}
              </span>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              {truckDocuments.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {copy.nothingFiled}
                </p>
              ) : (
                <DocumentList documents={truckDocuments} />
              )}
              <DocumentUploader owner="TRUCK" entityId={truck.id} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overview" className="mt-4">
          <TruckOverview
            truck={truck}
            odometerMiles={lifetime.odometerMiles}
            loadMiles={lifetime.totalMiles}
            milesPerGallon={fuel.milesPerGallon}
            activeTruckCount={running}
            canRestore={allowance.canAdd}
            profileIncomplete={profileIncomplete}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
