import { buildLoadProfitability } from "@/lib/finance/load-perspectives";
import { LoadProfitabilityCard } from "@/components/loads/load-profitability-card";
import { brokerContactNames } from "@/lib/broker-contacts";
import { buildLoadEstimator } from "@/lib/load-estimates";
import Link from "next/link";
import { brokerNameKey, brokerNames as savedBrokerNames } from "@/lib/brokers";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download, FileText, MapPin, Package, Pencil, Receipt } from "lucide-react";

import { InvoiceDialog } from "@/components/invoices/invoice-dialog";
import { nextInvoiceNumber } from "@/lib/invoices";
import { roleCan } from "@/lib/roles";
import { DocumentList } from "@/components/documents/document-list";
import { DocumentUploader } from "@/components/documents/document-uploader";
import { DeleteLoadButton } from "@/components/loads/delete-load-button";
import { TripWaterfall } from "@/components/loads/trip-waterfall";
import { LoadFormDialog } from "@/components/loads/load-form-dialog";
import { HistoryBackButton } from "@/components/shared/history-back-button";
import { Metric } from "@/components/shared/metric";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { requireSession } from "@/lib/auth";
import { getDataset } from "@/lib/db";
import {
  isDeadheadElevated,
  loadMetrics,
  thresholdsFromSettings,
  tripExpenseLines,
} from "@/lib/calculations";
import {
  hasSufficientOperatingCostBasis,
  overheadCostPerMile,
  trailingCostBasis,
} from "@/lib/finance/cost-per-mile";
import { calculateLoadScore } from "@/lib/finance/load-score";
import { LoadScoreBreakdown } from "@/components/cockpit/load-score-badge";
import {
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
  const dictionary = getWebDictionary(locale);
  const copy = dictionary.loads;
  const dataset = await getDataset(session.businessId);
  const load = dataset.loads.find((item) => item.id === id);
  if (!load) notFound();

  // Fuel and driver pay reach the ledger later; until then the load carries
  // their estimate so its profit is not overstated.
  const estimate = buildLoadEstimator(dataset, todayISO())(load);
  const metrics = loadMetrics(load, thresholdsFromSettings(dataset.settings), dataset.expenses, estimate);
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
  // Business, Driver and Owner-Operator views of the same trip lines and the
  // same allocation basis as the waterfall and the rating above.
  const profitability = buildLoadProfitability({
    grossRevenue: load.grossRate,
    loadedMiles: load.loadedMiles,
    deadheadMiles: load.deadheadMiles,
    lines: tripExpenseLines(load, dataset.expenses, estimate),
    allocatedCostPerMile: overheadCostPerMile(allocationBasis),
    allocationAvailable: hasSufficientOperatingCostBasis(allocationBasis),
    debtServicePerMile: allocationBasis.debtServicePerMile,
  });
  const brokerProfile = dataset.brokers?.find((row) => row.nameKey === brokerNameKey(load.broker ?? ""));
  const brokers = savedBrokerNames(dataset.loads, dataset.brokers);
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
            {load.broker ? <> - {brokerProfile ? <Link className="text-primary hover:underline" href={`/brokers/${brokerProfile.id}`}>{load.broker}</Link> : load.broker}{load.brokerContact ? ` (${load.brokerContact})` : ""}</> : null}
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
          {roleCan(session.role ?? "VIEWER", "manage_finances") ? (
            <InvoiceDialog load={load} suggestedNumber={nextInvoiceNumber(dataset.loads, todayISO())} today={todayISO()} canManage />
          ) : null}
          {load.invoiceNumber ? (
            <Button asChild variant="outline" size="sm">
              <a href={`/api/export/invoice/${load.id}`}><Download />{dictionary.invoices.downloadPdf}</a>
            </Button>
          ) : null}
          <LoadFormDialog
            load={load}
            brokers={brokers}
            brokerContacts={brokerContactNames(dataset.loads, dataset.brokers)}
            trucks={dataset.trucks}
            drivers={dataset.drivers}
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

        <TripWaterfall load={load} metrics={metrics} expenses={linkedExpenses} estimate={estimate} />

        <LoadProfitabilityCard
          profitability={profitability}
        />

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

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
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


        </div>
      </div>
    </div>
  );
}
