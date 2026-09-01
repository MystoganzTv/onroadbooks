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
import { orderedTrucks } from "@/lib/fleet";
import { param, truckFromSearchParams, type SearchParams } from "@/lib/period-params";
import { roleCan } from "@/lib/roles";

export const metadata: Metadata = { title: "IFTA" };

function quarterOptions(current: string): string[] {
  const [yearText, qText] = current.split("-Q");
  let year = Number(yearText); let quarter = Number(qText);
  return Array.from({ length: 8 }, () => {
    const value = `${year}-Q${quarter}`;
    quarter -= 1; if (quarter === 0) { quarter = 4; year -= 1; }
    return value;
  });
}

export default async function IftaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const session = await requireSession();
  const dataset = await getRepository(session.businessId).getDataset();
  const requested = param(params, "quarter", currentIftaQuarter());
  const quarter = /^\d{4}-Q[1-4]$/.test(requested) ? requested : currentIftaQuarter();
  const truckId = truckFromSearchParams(params, dataset.trucks);
  const report = calculateIftaReport(dataset, quarter, truckId);
  const canManage = roleCan(session.role ?? "VIEWER", "manage_finances");
  const rates = Object.fromEntries(report.jurisdictions.flatMap((row) => {
    const rate = dataset.settings.iftaTaxRates[iftaRateKey(quarter, row.jurisdiction)];
    return Number.isFinite(rate) ? [[row.jurisdiction, rate]] : [];
  }));
  const relevantLoads = dataset.loads.filter((load) => load.date >= report.start && load.date <= report.end && (!truckId || load.truckId === truckId));
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
  const missingFuel = dataset.fuelEntries.filter((entry) => entry.date >= report.start && entry.date <= report.end && (!truckId || entry.truckId === truckId) && !entry.jurisdiction);
  const baseQuery = new URLSearchParams({ quarter }); if (truckId) baseQuery.set("truck", truckId);
  const fuelQuery = new URLSearchParams({ month: report.start.slice(0, 7), period: "quarter" }); if (truckId) fuelQuery.set("truck", truckId);

  return <div className="space-y-4 p-4 lg:p-6">
    <PageHeader title="IFTA" description="Quarterly jurisdiction mileage, fuel allocation, and net tax due—with incomplete records called out before filing." />
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1">{quarterOptions(currentIftaQuarter()).map((option) => <Button key={option} asChild size="sm" variant={option === quarter ? "default" : "outline"}><Link href={`/ifta?quarter=${option}${truckId ? `&truck=${encodeURIComponent(truckId)}` : ""}`}>{option}</Link></Button>)}</div>
      <TruckSwitcher trucks={orderedTrucks(dataset.trucks)} selectedId={truckId} />
      <IftaRateDialog quarter={quarter} initialRates={rates} jurisdictions={report.jurisdictions.map((row) => row.jurisdiction)} canManage={canManage} />
      <Button asChild size="sm" variant="outline"><a href={`/api/export/ifta?${baseQuery.toString()}&format=xlsx`}><Download /> XLSX</a></Button>
      <Button asChild size="sm" variant="outline"><a href={`/api/export/ifta?${baseQuery.toString()}&format=pdf`}><Download /> PDF</a></Button>
    </div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {/*
        Spelled out as a division on purpose. This is the IFTA method -- every
        mile in the quarter over every gallon bought in it -- and it does not
        match the tank-to-tank MPG on the Fuel page, which ignores the gallons
        bought before the first odometer reading. Two different numbers for the
        same truck is alarming until you can see which question each answers.
      */}
      <MiniStat label="Fleet MPG" value={report.fleetMpg ? report.fleetMpg.toFixed(2) : "—"} sub={`${formatMiles(report.totalFleetMiles)} ÷ ${report.totalGallons.toFixed(1)} gal`} />
      <MiniStat label="IFTA miles" value={formatMiles(report.assignedMiles)} sub={`${formatMiles(report.totalFleetMiles)} fleet miles`} />
      <MiniStat label="Net tax due" value={report.netTaxDue == null ? "Incomplete" : formatMoney(report.netTaxDue)} tone={report.netTaxDue != null && report.netTaxDue < 0 ? "positive" : "warning"} sub="Credits shown negative" />
      <MiniStat label="Filing status" value={report.complete ? "Ready" : "Review"} tone={report.complete ? "positive" : "warning"} sub={`${report.start} to ${report.end}`} />
    </div>
    {!report.complete ? <Card className="border-warn/40"><CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="size-4 text-warn" /> Filing is incomplete</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground">
      {report.unassignedMiles ? <p>{formatMiles(report.unassignedMiles)} are not assigned to a jurisdiction across {missingLoads.length} load(s). The total is known, but the states or provinces actually crossed still need to be confirmed.</p> : null}
      {report.totalFleetMiles > 0 && report.totalGallons === 0 ? <p>{formatMiles(report.totalFleetMiles)} are recorded, but there are no detailed fuel purchases in this quarter. <Link href={`/fuel?${fuelQuery.toString()}`} className="text-primary underline underline-offset-2">Add actual gallons on the Fuel page.</Link></p> : null}
      {report.unassignedGallons ? <p>{report.unassignedGallons.toFixed(2)} gallons are missing a jurisdiction across {missingFuel.length} fuel purchase(s).</p> : null}
      {report.missingRateJurisdictions.length ? <p>Missing {quarter} rates: {report.missingRateJurisdictions.join(", ")}.</p> : null}
    </CardContent></Card> : null}
    {missingLoads.length ? <Card><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>Loads needing jurisdiction miles</CardTitle><p className="mt-1 text-xs text-muted-foreground">Trip totals arrive here automatically. Assign the actual route miles before filing.</p></div><Badge variant="warning">{formatMiles(report.unassignedMiles)} unassigned</Badge></div></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Load</TableHead><TableHead>Route</TableHead><TableHead className="text-right">Trip miles</TableHead><TableHead className="text-right">Assigned</TableHead><TableHead className="text-right">Unassigned</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{missingLoads.map(({ load, loadNumber, totalMiles, assignedMiles, unassignedMiles }) => <TableRow key={load.id}><TableCell><Link href={`/loads/${load.id}`} className="font-medium text-primary hover:underline">{loadNumber ? `#${loadNumber}` : `${load.originCity}–${load.destinationCity}`}</Link></TableCell><TableCell>{load.originState} → {load.destinationState}</TableCell><TableCell className="text-right tnum">{formatMiles(totalMiles)}</TableCell><TableCell className="text-right tnum">{formatMiles(assignedMiles)}</TableCell><TableCell className="text-right tnum text-warn">{formatMiles(unassignedMiles)}</TableCell><TableCell className="text-right">{canManage ? <LoadMileageDialog load={load} trigger={<Button size="sm" variant="outline">Assign miles</Button>} /> : <Button asChild size="sm" variant="outline"><Link href={`/loads/${load.id}`}>View load</Link></Button>}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card> : null}
    <Card><CardHeader><div className="flex items-center justify-between"><CardTitle>Jurisdiction detail</CardTitle><Badge variant={report.complete ? "positive" : "warning"}>{report.complete ? "Ready to file" : "Draft"}</Badge></div></CardHeader><CardContent className="p-0">
      {report.jurisdictions.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No IFTA mileage or fuel entries in this quarter.</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow>
        <TableHead>Jurisdiction</TableHead><TableHead className="text-right">Total miles</TableHead><TableHead className="text-right">Taxable miles</TableHead><TableHead className="text-right">Tax-paid gal.</TableHead><TableHead className="text-right">Taxable gal.</TableHead><TableHead className="text-right">Net gal.</TableHead><TableHead className="text-right">Rate</TableHead><TableHead className="text-right">Tax due</TableHead>
      </TableRow></TableHeader><TableBody>{report.jurisdictions.map((row) => <TableRow key={row.jurisdiction}><TableCell className="font-medium">{row.jurisdiction}</TableCell><TableCell className="text-right tnum">{formatMiles(row.totalMiles)}</TableCell><TableCell className="text-right tnum">{formatMiles(row.taxableMiles)}</TableCell><TableCell className="text-right tnum">{row.taxPaidGallons.toFixed(2)}</TableCell><TableCell className="text-right tnum">{row.taxableGallons.toFixed(2)}</TableCell><TableCell className="text-right tnum">{row.netTaxableGallons.toFixed(2)}</TableCell><TableCell className="text-right tnum">{row.taxRate == null ? "Missing" : formatRateValue(row.taxRate)}</TableCell><TableCell className="text-right font-medium tnum">{row.taxDue == null ? "—" : formatMoney(row.taxDue)}</TableCell></TableRow>)}</TableBody></Table></div>}
    </CardContent></Card>
    <p className="text-2xs text-muted-foreground">IFTA mileage must reflect the actual route in each jurisdiction. Onroad Books never guesses it from origin and destination. Confirm rates and filing treatment with your base jurisdiction.</p>
    <p className="text-2xs text-muted-foreground">Fleet MPG here is every mile in the quarter divided by every gallon bought in it, which is the method the filing uses. The <Link href="/fuel" className="text-primary underline underline-offset-2">Fuel</Link> page reports tank-to-tank MPG instead — it skips the gallons bought before the first odometer reading — so the two figures are not meant to match.</p>
  </div>;
}
