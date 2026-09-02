import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Download } from "lucide-react";

import { IftaRateDialog } from "@/components/ifta/ifta-rate-dialog";
import { LoadMileageDialog } from "@/components/ifta/load-mileage-dialog";
import { TruckSwitcher } from "@/components/fleet/truck-switcher";
import { MiniStat } from "@/components/dashboard/mini-stat";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { formatMiles, formatMoney, formatRateValue } from "@/lib/formatters";
import { calculateIftaReport, currentIftaQuarter, iftaRateKey, normalizeJurisdictionMiles } from "@/lib/ifta";
import { activeTrucks, orderedTrucks, truckById } from "@/lib/fleet";
import { iftaPendingScopeTruckIds } from "@/lib/ifta";
import {
  fleetIftaApplicability,
  iftaApplicability,
  iftaApplicabilityLabel,
  iftaReportingLabel,
  iftaReportingTruckIds,
} from "@/lib/ifta-eligibility";
import type { Truck } from "@/lib/types";
import { param, truckFromSearchParams, type SearchParams } from "@/lib/period-params";
import { roleCan } from "@/lib/roles";
import { getWebDictionary, interpolate, type WebDictionary } from "@/lib/i18n/dictionaries";
import { getAppLocale } from "@/lib/i18n-server";
import type { AppLocale } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).ifta.metadataTitle };
}

function quarterOptions(current: string): string[] {
  const [yearText, qText] = current.split("-Q");
  let year = Number(yearText); let quarter = Number(qText);
  return Array.from({ length: 8 }, () => {
    const value = `${year}-Q${quarter}`;
    quarter -= 1; if (quarter === 0) { quarter = 4; year -= 1; }
    return value;
  });
}

function IftaTruckScope({ trucks, copy, locale }: { trucks: Truck[]; copy: WebDictionary["ifta"]; locale: AppLocale }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader><TableRow>
          <TableHead>{copy.truck}</TableHead>
          <TableHead>{copy.standardTest}</TableHead>
          <TableHead>{copy.filingDecision}</TableHead>
          <TableHead className="text-right">{copy.action}</TableHead>
        </TableRow></TableHeader>
        <TableBody>{trucks.map((truck) => {
          const decision = iftaReportingLabel(truck.iftaReportingEnabled, locale);
          return <TableRow key={truck.id}>
            <TableCell className="font-medium">{truck.name}</TableCell>
            <TableCell>{iftaApplicabilityLabel(iftaApplicability(truck), locale)}</TableCell>
            <TableCell>
              <Badge variant={decision === copy.included ? "positive" : decision === copy.excluded ? "outline" : "warning"}>
                {decision}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <Button asChild size="sm" variant="outline">
                <Link href={`/truck?truck=${encodeURIComponent(truck.id)}`}>{copy.reviewTruck}</Link>
              </Button>
            </TableCell>
          </TableRow>;
        })}</TableBody>
      </Table>
    </div>
  );
}

export default async function IftaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, session, locale] = await Promise.all([searchParams, requireSession(), getAppLocale()]);
  const copy = getWebDictionary(locale).ifta;
  const dataset = await getRepository(session.businessId).getDataset();
  const requested = param(params, "quarter", currentIftaQuarter());
  const quarter = /^\d{4}-Q[1-4]$/.test(requested) ? requested : currentIftaQuarter();
  const truckId = truckFromSearchParams(params, dataset.trucks);
  const selectedTruck = truckById(dataset.trucks, truckId);
  const runningTrucks = activeTrucks(dataset.trucks);
  const includedTruckIds = iftaReportingTruckIds(dataset.trucks);
  // Every truck that ran this quarter, not just the ones still on the road.
  const pendingTruckIds = new Set(iftaPendingScopeTruckIds(dataset, quarter));
  const pendingTrucks = dataset.trucks.filter((truck) => pendingTruckIds.has(truck.id));
  const scopeTrucks = orderedTrucks(
    dataset.trucks.filter((truck) => truck.active || pendingTruckIds.has(truck.id)),
  );
  const applicability = selectedTruck
    ? iftaApplicability(selectedTruck)
    : fleetIftaApplicability(runningTrucks);

  const needsScopeDecision = selectedTruck
    ? selectedTruck.iftaReportingEnabled !== true
    : includedTruckIds.length === 0;
  if (needsScopeDecision) {
    const decision = selectedTruck
      ? iftaReportingLabel(selectedTruck.iftaReportingEnabled, locale)
      : pendingTrucks.length > 0
        ? copy.decisionNeeded
        : copy.excluded;
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <PageHeader
          title={copy.title}
          description={copy.scopeDescription}
        />
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>{selectedTruck ? selectedTruck.name : copy.filingScope}</CardTitle>
              <Badge variant={decision === copy.decisionNeeded ? "warning" : "outline"}>
                {decision}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              {copy.scopeExplanation}
            </p>
            <p>
              {copy.standardExplanation}
            </p>
            <p><span className="font-semibold text-foreground">{copy.recommendation}</span> {iftaApplicabilityLabel(applicability, locale)}.</p>
            <IftaTruckScope trucks={selectedTruck ? [selectedTruck] : scopeTrucks} copy={copy} locale={locale} />
          </CardContent>
        </Card>
      </div>
    );
  }
  const calculated = calculateIftaReport(
    dataset,
    quarter,
    truckId,
    truckId ? null : includedTruckIds,
  );
  const scopeComplete = Boolean(truckId) || pendingTrucks.length === 0;
  const report = {
    ...calculated,
    complete: calculated.complete && scopeComplete,
    netTaxDue: scopeComplete ? calculated.netTaxDue : null,
  };
  const canManage = roleCan(session.role ?? "VIEWER", "manage_ifta");
  const rates = Object.fromEntries(report.jurisdictions.flatMap((row) => {
    const rate = dataset.settings.iftaTaxRates[iftaRateKey(quarter, row.jurisdiction)];
    return Number.isFinite(rate) ? [[row.jurisdiction, rate]] : [];
  }));
  const reportingTruckIds = new Set(truckId ? [truckId] : includedTruckIds);
  const relevantLoads = dataset.loads.filter((load) => load.date >= report.start && load.date <= report.end && reportingTruckIds.has(load.truckId));
  const missingLoads = relevantLoads.flatMap((load) => {
    const totalMiles = load.loadedMiles + load.deadheadMiles;
    const assignedMiles = normalizeJurisdictionMiles(load.jurisdictionMiles).reduce((sum, row) => sum + row.totalMiles, 0);
    return assignedMiles === totalMiles
      ? []
      : [{
          load: {
            id: load.id,
            originCity: load.originCity,
            originState: load.originState,
            destinationCity: load.destinationCity,
            destinationState: load.destinationState,
            loadedMiles: load.loadedMiles,
            deadheadMiles: load.deadheadMiles,
            jurisdictionMiles: load.jurisdictionMiles,
          },
          loadNumber: load.loadNumber,
          totalMiles,
          assignedMiles,
          unassignedMiles: Math.max(0, totalMiles - assignedMiles),
        }];
  });
  const missingFuel = dataset.fuelEntries.filter((entry) => entry.date >= report.start && entry.date <= report.end && reportingTruckIds.has(entry.truckId) && !entry.jurisdiction);
  const baseQuery = new URLSearchParams({ quarter }); if (truckId) baseQuery.set("truck", truckId);
  const fuelQuery = new URLSearchParams({ month: report.start.slice(0, 7), period: "quarter" }); if (truckId) fuelQuery.set("truck", truckId);

  return <div className="space-y-4 p-4 lg:p-6">
    <PageHeader title={copy.title} description={copy.description} />
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1">{quarterOptions(currentIftaQuarter()).map((option) => <Button key={option} asChild size="sm" variant={option === quarter ? "default" : "outline"}><Link href={`/ifta?quarter=${option}${truckId ? `&truck=${encodeURIComponent(truckId)}` : ""}`}>{option}</Link></Button>)}</div>
      <TruckSwitcher trucks={orderedTrucks(dataset.trucks)} selectedId={truckId} />
      <IftaRateDialog quarter={quarter} initialRates={rates} jurisdictions={report.jurisdictions.map((row) => row.jurisdiction)} canManage={canManage} />
      <Button asChild size="sm" variant="outline"><a href={`/api/export/ifta?${baseQuery.toString()}&format=xlsx`}><Download /> XLSX</a></Button>
      <Button asChild size="sm" variant="outline"><a href={`/api/export/ifta?${baseQuery.toString()}&format=pdf`}><Download /> PDF</a></Button>
    </div>
    {!truckId ? <Card><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>{copy.trucksInFiling}</CardTitle><Badge variant={pendingTrucks.length ? "warning" : "positive"}>{interpolate(copy.includedCount, { count: includedTruckIds.length })}</Badge></div></CardHeader><CardContent className="space-y-3"><p className="text-xs text-muted-foreground">{copy.includedExplanation}</p><IftaTruckScope trucks={scopeTrucks} copy={copy} locale={locale} /></CardContent></Card> : null}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {/*
        Spelled out as a division on purpose. This is the IFTA method -- every
        mile in the quarter over every gallon bought in it -- and it does not
        match the tank-to-tank MPG on the Fuel page, which ignores the gallons
        bought before the first odometer reading. Two different numbers for the
        same truck is alarming until you can see which question each answers.
      */}
      <MiniStat label={copy.fleetMpg} value={report.fleetMpg ? report.fleetMpg.toFixed(2) : "—"} sub={`${formatMiles(report.totalFleetMiles)} ÷ ${report.totalGallons.toFixed(1)} ${copy.gallons}`} />
      <MiniStat label={copy.iftaMiles} value={formatMiles(report.assignedMiles)} sub={interpolate(copy.fleetMiles, { miles: formatMiles(report.totalFleetMiles) })} />
      <MiniStat label={copy.netTaxDue} value={report.netTaxDue == null ? copy.incomplete : formatMoney(report.netTaxDue)} tone={report.netTaxDue != null && report.netTaxDue < 0 ? "positive" : "warning"} sub={copy.creditsNegative} />
      <MiniStat label={copy.filingStatus} value={report.complete ? copy.ready : copy.review} tone={report.complete ? "positive" : "warning"} sub={`${report.start} ${getWebDictionary(locale).loads.to} ${report.end}`} />
    </div>
    {!report.complete ? <Card className="border-warn/40"><CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="size-4 text-warn" /> {copy.filingIncomplete}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground">
      {report.unassignedMiles ? <p>{interpolate(copy.unassignedMilesProblem, { miles: formatMiles(report.unassignedMiles), count: missingLoads.length })}</p> : null}
      {report.totalFleetMiles > 0 && report.totalGallons === 0 ? <p>{interpolate(copy.missingFuelProblem, { miles: formatMiles(report.totalFleetMiles) })} <Link href={`/fuel?${fuelQuery.toString()}`} className="text-primary underline underline-offset-2">{copy.addFuel}</Link></p> : null}
      {report.unassignedGallons ? <p>{interpolate(copy.missingFuelJurisdiction, { gallons: report.unassignedGallons.toFixed(2), count: missingFuel.length })}</p> : null}
      {report.missingRateJurisdictions.length ? <p>{interpolate(copy.missingRates, { quarter, rates: report.missingRateJurisdictions.join(", ") })}</p> : null}
      {!scopeComplete ? <p>{interpolate(copy.pendingTrucks, { count: pendingTrucks.length })}</p> : null}
    </CardContent></Card> : null}
    {missingLoads.length ? <Card><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>{copy.loadsNeedMiles}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{copy.loadsNeedDescription}</p></div><Badge variant="warning">{interpolate(copy.unassigned, { miles: formatMiles(report.unassignedMiles) })}</Badge></div></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{copy.load}</TableHead><TableHead>{copy.route}</TableHead><TableHead className="text-right">{copy.tripMiles}</TableHead><TableHead className="text-right">{copy.assigned}</TableHead><TableHead className="text-right">{copy.unassigned.replace("{miles} ", "")}</TableHead><TableHead className="text-right">{copy.actionLabel}</TableHead></TableRow></TableHeader><TableBody>{missingLoads.map(({ load, loadNumber, totalMiles, assignedMiles, unassignedMiles }) => <TableRow key={load.id}><TableCell><Link href={`/loads/${load.id}`} className="font-medium text-primary hover:underline">{loadNumber ? `#${loadNumber}` : `${load.originCity}–${load.destinationCity}`}</Link></TableCell><TableCell>{load.originState} → {load.destinationState}</TableCell><TableCell className="text-right tnum">{formatMiles(totalMiles)}</TableCell><TableCell className="text-right tnum">{formatMiles(assignedMiles)}</TableCell><TableCell className="text-right tnum text-warn">{formatMiles(unassignedMiles)}</TableCell><TableCell className="text-right">{canManage ? <LoadMileageDialog load={load} trigger={<Button size="sm" variant="outline">{copy.assignMiles}</Button>} /> : <Button asChild size="sm" variant="outline"><Link href={`/loads/${load.id}`}>{copy.viewLoad}</Link></Button>}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card> : null}
    <Card><CardHeader><div className="flex items-center justify-between"><CardTitle>{copy.jurisdictionDetail}</CardTitle><Badge variant={report.complete ? "positive" : "warning"}>{report.complete ? copy.readyToFile : copy.draft}</Badge></div></CardHeader><CardContent className="p-0">
      {report.jurisdictions.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">{copy.noEntries}</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow>
        <TableHead>{copy.jurisdiction}</TableHead><TableHead className="text-right">{copy.totalMiles}</TableHead><TableHead className="text-right">{copy.taxableMiles}</TableHead><TableHead className="text-right">{copy.taxPaidGallons}</TableHead><TableHead className="text-right">{copy.taxableGallons}</TableHead><TableHead className="text-right">{copy.netGallons}</TableHead><TableHead className="text-right">{copy.rate}</TableHead><TableHead className="text-right">{copy.taxDue}</TableHead>
      </TableRow></TableHeader><TableBody>{report.jurisdictions.map((row) => <TableRow key={row.jurisdiction}><TableCell className="font-medium">{row.jurisdiction}</TableCell><TableCell className="text-right tnum">{formatMiles(row.totalMiles)}</TableCell><TableCell className="text-right tnum">{formatMiles(row.taxableMiles)}</TableCell><TableCell className="text-right tnum">{row.taxPaidGallons.toFixed(2)}</TableCell><TableCell className="text-right tnum">{row.taxableGallons.toFixed(2)}</TableCell><TableCell className="text-right tnum">{row.netTaxableGallons.toFixed(2)}</TableCell><TableCell className="text-right tnum">{row.taxRate == null ? copy.missing : formatRateValue(row.taxRate)}</TableCell><TableCell className="text-right font-medium tnum">{row.taxDue == null ? "—" : formatMoney(row.taxDue)}</TableCell></TableRow>)}</TableBody></Table></div>}
    </CardContent></Card>
    <p className="text-2xs text-muted-foreground">{copy.routeRule}</p>
    <p className="text-2xs text-muted-foreground">{copy.mpgRuleBefore} <Link href="/fuel" className="text-primary underline underline-offset-2">{copy.fuel}</Link> {copy.mpgRuleAfter}</p>
  </div>;
}
