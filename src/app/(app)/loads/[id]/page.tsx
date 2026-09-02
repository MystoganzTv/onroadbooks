import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileText, Fuel, MapPin, Package, Pencil, Receipt } from "lucide-react";

import { DocumentList } from "@/components/documents/document-list";
import { DocumentUploader } from "@/components/documents/document-uploader";
import { DeleteLoadButton } from "@/components/loads/delete-load-button";
import { TripWaterfall } from "@/components/loads/trip-waterfall";
import { LoadFormDialog } from "@/components/loads/load-form-dialog";
import { LoadStatusControl } from "@/components/loads/load-status-control";
import { HistoryBackButton } from "@/components/shared/history-back-button";
import { Metric } from "@/components/shared/metric";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { requireSession } from "@/lib/auth";
import { getDataset } from "@/lib/db";
import { driverScheduleFromLoads } from "@/lib/driver-availability";
import { hasFleetAccess } from "@/lib/plans";
import {
  isDeadheadElevated,
  linkedFuelByLoad,
  loadMetrics,
  roundMoney,
  thresholdsFromSettings,
} from "@/lib/calculations";
import {
  overheadCostPerMile,
  trailingCostBasis,
} from "@/lib/finance/cost-per-mile";
import { calculateLoadScore } from "@/lib/finance/load-score";
import { LoadScoreBreakdown } from "@/components/cockpit/load-score-badge";
import {
  formatGallons,
  formatMiles,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRateValue,
} from "@/lib/formatters";
import { categoryLabel } from "@/lib/categories";
import { equipmentTypeLabel, loadCapacityLabel } from "@/lib/load-details";
import { todayISO } from "@/lib/periods";
import { getWebDictionary, interpolate } from "@/lib/i18n/dictionaries";
import { formatLocaleDate } from "@/lib/i18n-format";
import { getAppLocale } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).loads.detailMetadataTitle };
}

export default async function LoadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session, locale] = await Promise.all([params, requireSession(), getAppLocale()]);
  const copy = getWebDictionary(locale).loads;
  const dataset = await getDataset(session.businessId);
  const load = dataset.loads.find((item) => item.id === id);
  if (!load) notFound();

  // A real fill-up linked to this load supersedes the fuel figure typed on the
  // rate confirmation. The ledger already drops the load's own fuel row when
  // that happens, so the trip's profit and its score have to use the same
  // diesel or the page contradicts itself.
  const linkedFuel = dataset.fuelEntries.filter((entry) => entry.loadId === load.id);
  const linkedFuelCost = linkedFuelByLoad(linkedFuel).get(load.id);
  const metrics = loadMetrics(load, thresholdsFromSettings(dataset.settings), linkedFuelCost);
  const score = calculateLoadScore(
    metrics,
    thresholdsFromSettings(dataset.settings),
    dataset.settings.deadheadWarnPct,
  );
  const allocationBasis = trailingCostBasis(
    dataset.loads,
    dataset.expenses,
    dataset.settings,
    todayISO(),
  );
  const allocatedOperatingCosts = roundMoney(
    metrics.totalMiles * overheadCostPerMile(allocationBasis),
  );
  const fullyLoadedOperatingProfit = roundMoney(
    metrics.tripProfit - allocatedOperatingCosts,
  );
  const debtCashBurden = roundMoney(
    metrics.totalMiles * allocationBasis.debtServicePerMile,
  );
  const brokers = [...new Set(dataset.loads.map((l) => l.broker).filter(Boolean))].sort() as string[];
  const linkedExpenses = dataset.expenses.filter((expense) => expense.loadId === load.id);
  const documents = dataset.documents.filter((doc) => doc.loadId === load.id);
  const route = `${load.originCity}, ${load.originState} ${copy.to} ${load.destinationCity}, ${load.destinationState}`;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <HistoryBackButton fallbackHref="/loads" label={copy.back} className="-ml-2 mb-1" />
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <MapPin className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{route}</span>
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {copy.pickup} {formatLocaleDate(load.date, locale, "long")}
            {load.deliveryDate ? ` - ${copy.delivery} ${formatLocaleDate(load.deliveryDate, locale, "long")}` : ""}
            {load.broker ? ` - ${load.broker}` : ""}
            {load.loadNumber ? ` - ${interpolate(copy.loadNumber, { number: load.loadNumber })}` : ""}
            {dataset.trucks.length > 1
              ? ` - ${dataset.trucks.find((t) => t.id === load.truckId)?.name ?? copy.unknownTruck}`
              : ""}
            {load.driverId
              ? ` - ${dataset.drivers.find((driver) => driver.id === load.driverId)?.name ?? copy.unknownDriver}`
              : ""}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <LoadStatusControl id={load.id} status={load.status} />
          <LoadFormDialog
            load={load}
            brokers={brokers}
            trucks={dataset.trucks}
            drivers={hasFleetAccess(dataset.subscription) ? dataset.drivers : []}
            driverSchedule={driverScheduleFromLoads(dataset.loads)}
            ratingThresholds={thresholdsFromSettings(dataset.settings)}
            trigger={
              <Button variant="outline" size="sm">
                <Pencil />
                {copy.edit}
              </Button>
            }
          />
          <DeleteLoadButton id={load.id} label={route} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
        <LoadScoreBreakdown score={score} showBasis="trip" />

        <TripWaterfall load={load} metrics={metrics} linkedFuelCost={linkedFuelCost} />

        <Card>
          <CardHeader>
            <CardTitle>{copy.profitabilityLayers}</CardTitle>
            <span className="text-2xs text-muted-foreground">
              {interpolate(copy.ratingBasis, { basis: allocationBasis.basisLabel })}
            </span>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            <Layer label={copy.grossRate} value={load.grossRate} />
            <Layer label={copy.directTripCosts} value={-metrics.tripExpenses} />
            <Layer label={copy.contributionProfit} value={metrics.tripProfit} strong />
            <Separator />
            <Layer label={copy.allocatedEstimate} value={-allocatedOperatingCosts} />
            <Layer
              label={copy.estimatedFullyLoaded}
              value={fullyLoadedOperatingProfit}
              strong
            />
            <Separator />
            <Layer label={copy.debtSeparate} value={-debtCashBurden} />
            <p className="text-2xs text-muted-foreground">
              {copy.debtRatingExplanation}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{copy.tripEconomics}</CardTitle>
            <span className="text-2xs text-muted-foreground">
              {interpolate(copy.deadheadOfMiles, { percent: formatPercent(metrics.deadheadPct) })}
            </span>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric label={copy.grossRate} value={formatMoney(load.grossRate)} />
              <Metric label={copy.loadedMiles} value={formatMiles(load.loadedMiles)} />
              <Metric label={copy.deadheadMiles} value={formatMiles(load.deadheadMiles)} />
              <Metric label={copy.totalMiles} value={formatMiles(metrics.totalMiles)} />
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric
                label={copy.rateLoadedMile}
                value={`${formatRateValue(metrics.revenuePerLoadedMile)}/mi`}
              />
              <Metric
                label={copy.rateTotalMile}
                value={`${formatRateValue(metrics.revenuePerTotalMile)}/mi`}
              />
              <Metric
                label={copy.deadheadShort}
                value={formatPercent(metrics.deadheadPct)}
                valueClassName={
                  isDeadheadElevated(metrics.deadheadPct, dataset.settings.deadheadWarnPct)
                    ? "text-warn"
                    : undefined
                }
                sub={interpolate(copy.emptyMiles, { miles: formatMiles(load.deadheadMiles) })}
              />
              <Metric
                label={copy.paymentStatus}
                value={load.status === "PAID" ? copy.paid : load.status === "INVOICED" ? copy.invoiced : copy.pending}
                sub={load.loadNumber ? interpolate(copy.loadNumber, { number: load.loadNumber }) : undefined}
              />
            </div>

            {load.notes ? (
              <>
                <Separator />
                <div>
                  <p className="label-xs">{copy.notes}</p>
                  <p className="mt-1 text-sm text-foreground/90">{load.notes}</p>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Package className="size-3.5 text-muted-foreground" />
                <CardTitle>{copy.loadDetails}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-4 gap-y-3 p-4">
              <Metric label={copy.pickup} value={formatLocaleDate(load.date, locale, "long")} />
              <Metric
                label={copy.delivery}
                value={load.deliveryDate ? formatLocaleDate(load.deliveryDate, locale, "long") : copy.notSpecified}
              />
              <Metric
                label={copy.equipment}
                value={equipmentTypeLabel(load.equipmentType, locale)}
                sub={load.equipmentLengthFt ? `${load.equipmentLengthFt} ft` : undefined}
              />
              <Metric label={copy.loadType} value={loadCapacityLabel(load.loadCapacity, locale)} />
              <Metric
                label={copy.weight}
                value={load.weightLbs ? `${formatNumber(load.weightLbs)} lb` : copy.notSpecified}
              />
              <Metric label={copy.commodity} value={load.commodity ?? copy.notSpecified} />
              <Metric
                label={copy.endingOdometer}
                value={load.endingOdometer ? formatNumber(load.endingOdometer) : copy.notRecorded}
                sub={load.endingOdometer ? "mi" : undefined}
              />
              <Metric label={copy.tripCosts} value={copy.includedExpenses} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="size-3.5 text-muted-foreground" />
                <CardTitle>{copy.documents}</CardTitle>
              </div>
              <span className="text-2xs text-muted-foreground tnum">{documents.length}</span>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              {documents.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {copy.noDocuments}
                </p>
              ) : (
                <DocumentList documents={documents} />
              )}
              <DocumentUploader owner="LOAD" entityId={load.id} compact />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Receipt className="size-3.5 text-muted-foreground" />
                <CardTitle>{copy.linkedExpenses}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {linkedExpenses.length === 0 ? (
                <p className="px-4 py-4 text-xs text-muted-foreground">
                  {copy.noLinkedExpenses}
                </p>
              ) : (
                <ul className="divide-y divide-border/70">
                  {linkedExpenses.map((expense) => (
                    <li key={expense.id} className="flex items-baseline justify-between gap-3 px-4 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{expense.description}</span>
                        <span className="text-2xs text-muted-foreground">
                          {categoryLabel(expense.category, locale)}
                        </span>
                      </span>
                      <span className="shrink-0 tnum text-sm text-neg">
                        -{formatMoney(expense.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Fuel className="size-3.5 text-muted-foreground" />
                <CardTitle>{copy.linkedFuel}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {linkedFuel.length === 0 ? (
                <p className="px-4 py-4 text-xs text-muted-foreground">
                  {copy.noLinkedFuel}
                </p>
              ) : (
                <ul className="divide-y divide-border/70">
                  {linkedFuel.map((entry) => (
                    <li key={entry.id} className="flex items-baseline justify-between gap-3 px-4 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm">
                          {entry.location ?? copy.fuelStop}
                        </span>
                        <span className="text-2xs text-muted-foreground tnum">
                          {formatGallons(entry.gallons)}
                        </span>
                      </span>
                      <span className="shrink-0 tnum text-sm text-neg">
                        -{formatMoney(entry.totalCost)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Layer({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={strong ? "text-sm font-semibold" : "text-sm text-muted-foreground"}>
        {label}
      </span>
      <span
        className={`tnum text-sm ${strong ? "font-semibold" : ""} ${value < 0 ? "text-neg" : ""}`}
      >
        {formatMoney(value)}
      </span>
    </div>
  );
}
