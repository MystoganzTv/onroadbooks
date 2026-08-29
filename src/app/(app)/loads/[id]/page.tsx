import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Fuel, MapPin, Pencil, Receipt } from "lucide-react";

import { DocumentList } from "@/components/documents/document-list";
import { DocumentUploader } from "@/components/documents/document-uploader";
import { DeleteLoadButton } from "@/components/loads/delete-load-button";
import { TripWaterfall } from "@/components/loads/trip-waterfall";
import { LoadFormDialog } from "@/components/loads/load-form-dialog";
import { LoadStatusControl } from "@/components/loads/load-status-control";
import { Metric } from "@/components/shared/metric";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { loadMetrics, thresholdsFromSettings } from "@/lib/calculations";
import { calculateLoadScore } from "@/lib/finance/load-score";
import { LoadScoreBreakdown } from "@/components/cockpit/load-score-badge";
import {
  formatDateLong,
  formatGallons,
  formatMiles,
  formatMoney,
  formatPercent,
  formatRateValue,
} from "@/lib/formatters";
import { categoryLabel } from "@/lib/categories";

export const metadata: Metadata = { title: "Load detail" };

export default async function LoadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const dataset = await getRepository(session.businessId).getDataset();
  const load = dataset.loads.find((item) => item.id === id);
  if (!load) notFound();

  const metrics = loadMetrics(load, thresholdsFromSettings(dataset.settings));
  const score = calculateLoadScore(
    metrics,
    thresholdsFromSettings(dataset.settings),
    dataset.settings.deadheadWarnPct,
  );
  const brokers = [...new Set(dataset.loads.map((l) => l.broker).filter(Boolean))].sort() as string[];
  const linkedExpenses = dataset.expenses.filter((expense) => expense.loadId === load.id);
  const linkedFuel = dataset.fuelEntries.filter((entry) => entry.loadId === load.id);
  const documents = dataset.documents.filter((doc) => doc.loadId === load.id);
  const route = `${load.originCity}, ${load.originState} to ${load.destinationCity}, ${load.destinationState}`;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1 text-muted-foreground">
            <Link href="/loads">
              <ArrowLeft />
              All loads
            </Link>
          </Button>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <MapPin className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{route}</span>
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatDateLong(load.date)}
            {load.broker ? ` - ${load.broker}` : ""}
            {load.loadNumber ? ` - Load #${load.loadNumber}` : ""}
            {dataset.trucks.length > 1
              ? ` - ${dataset.trucks.find((t) => t.id === load.truckId)?.name ?? "Unknown truck"}`
              : ""}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <LoadStatusControl id={load.id} status={load.status} />
          <LoadFormDialog
            load={load}
            brokers={brokers}
            trucks={dataset.trucks}
            ratingThresholds={thresholdsFromSettings(dataset.settings)}
            trigger={
              <Button variant="outline" size="sm">
                <Pencil />
                Edit
              </Button>
            }
          />
          <DeleteLoadButton id={load.id} label={route} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
        <LoadScoreBreakdown score={score} />

        <TripWaterfall load={load} metrics={metrics} />

        <Card>
          <CardHeader>
            <CardTitle>Trip Economics</CardTitle>
            <span className="text-2xs text-muted-foreground">
              Deadhead {formatPercent(metrics.deadheadPct)} of total miles
            </span>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric label="Gross Rate" value={formatMoney(load.grossRate)} />
              <Metric label="Loaded Miles" value={formatMiles(load.loadedMiles)} />
              <Metric label="Deadhead Miles" value={formatMiles(load.deadheadMiles)} />
              <Metric label="Total Miles" value={formatMiles(metrics.totalMiles)} />
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric
                label="Rate / Loaded Mile"
                value={`${formatRateValue(metrics.revenuePerLoadedMile)}/mi`}
              />
              <Metric
                label="Rate / Total Mile"
                value={`${formatRateValue(metrics.revenuePerTotalMile)}/mi`}
              />
              <Metric
                label="Deadhead"
                value={formatPercent(metrics.deadheadPct)}
                valueClassName={metrics.deadheadPct > 20 ? "text-warn" : undefined}
                sub={`${formatMiles(load.deadheadMiles)} empty`}
              />
              <Metric
                label="Payment Status"
                value={load.status.charAt(0) + load.status.slice(1).toLowerCase()}
                sub={load.loadNumber ? `Load #${load.loadNumber}` : undefined}
              />
            </div>

            {load.notes ? (
              <>
                <Separator />
                <div>
                  <p className="label-xs">Notes</p>
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
                <FileText className="size-3.5 text-muted-foreground" />
                <CardTitle>Documents</CardTitle>
              </div>
              <span className="text-2xs text-muted-foreground tnum">{documents.length}</span>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              {documents.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No rate confirmation, BOL, POD or invoice attached yet.
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
                <CardTitle>Linked Expenses</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {linkedExpenses.length === 0 ? (
                <p className="px-4 py-4 text-xs text-muted-foreground">
                  No ledger expenses are linked to this load. Trip fuel, tolls and other costs above
                  are recorded on the load itself.
                </p>
              ) : (
                <ul className="divide-y divide-border/70">
                  {linkedExpenses.map((expense) => (
                    <li key={expense.id} className="flex items-baseline justify-between gap-3 px-4 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{expense.description}</span>
                        <span className="text-2xs text-muted-foreground">
                          {categoryLabel(expense.category)}
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
                <CardTitle>Linked Fuel</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {linkedFuel.length === 0 ? (
                <p className="px-4 py-4 text-xs text-muted-foreground">
                  No fuel stops are linked to this load.
                </p>
              ) : (
                <ul className="divide-y divide-border/70">
                  {linkedFuel.map((entry) => (
                    <li key={entry.id} className="flex items-baseline justify-between gap-3 px-4 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm">
                          {entry.location ?? "Fuel stop"}
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
