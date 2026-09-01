import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PeriodControls } from "@/components/dashboard/period-controls";
import { MiniStat } from "@/components/dashboard/mini-stat";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireSession } from "@/lib/auth";
import { summarizePeriod } from "@/lib/calculations";
import { getRepository } from "@/lib/db";
import { calculateFleetSummary, fleetExtremes } from "@/lib/finance/fleet";
import { orderedTrucks } from "@/lib/fleet";
import { hasFleetAccess } from "@/lib/plans";
import {
  formatMiles,
  formatMoney,
  formatMoneyCompact,
  formatPercent,
  formatRateValue,
} from "@/lib/formatters";
import { periodFromSearchParams, periodQuery, type SearchParams } from "@/lib/period-params";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Fleet" };

/**
 * THE FLEET VIEW.
 *
 * One question per half of the page.
 *
 *   The table  Does each unit pay for itself? Every truck reports revenue
 *              minus the costs it caused -- its CONTRIBUTION. No share of
 *              the phone bill is imputed to it, because dividing overhead
 *              between trucks turns a fact into an opinion about how to
 *              divide, and the owner would then be deciding whether to sell
 *              a truck on the strength of an allocation rule.
 *
 *   The bottom Does the BUSINESS make money? Overhead comes out once,
 *              visibly, and what is left is the operating profit -- the same
 *              number the dashboard has been showing all along.
 *
 * The reconciliation is printed on the page rather than assumed, because a
 * fleet view whose total disagreed with the dashboard would be worse than
 * having no fleet view at all.
 */
export default async function FleetPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const session = await requireSession();
  const { trucks, loads, expenses, settings, subscription, paymentEvents } = await getRepository(
    session.businessId,
  ).getDataset();

  // Fleet is a separate paid service. An individual account never sees a
  // preview of the operational Fleet workspace, even if an old truck row
  // remains in its history.
  if (!hasFleetAccess(subscription)) redirect("/truck");

  const period = periodFromSearchParams(params);
  const fleet = calculateFleetSummary(orderedTrucks(trucks), loads, expenses, period, settings, paymentEvents);
  const summary = summarizePeriod(loads, expenses, period, settings, paymentEvents);
  const { best, weakest } = fleetExtremes(fleet);

  const loadCount = fleet.units.reduce((total, unit) => total + unit.loadCount, 0);
  const idle = fleet.units.filter((unit) => unit.loadCount === 0);

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title="Fleet"
        description="What each unit contributes, and what the business keeps after the costs no truck caused."
      />

      <PeriodControls period={period} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <MiniStat
          label="Booked Revenue"
          value={formatMoneyCompact(fleet.revenue)}
          sub={`${loadCount} ${loadCount === 1 ? "load" : "loads"}`}
          tone="info"
        />
        <MiniStat
          label="Contribution"
          value={formatMoneyCompact(fleet.contribution)}
          sub="after each truck's own costs"
        />
        <MiniStat
          label="Overhead"
          value={formatMoneyCompact(fleet.overhead)}
          sub="belongs to no single truck"
        />
        <MiniStat
          label="Operating Profit"
          value={formatMoneyCompact(fleet.operatingProfit)}
          sub={period.shortLabel}
          tone={fleet.operatingProfit >= 0 ? "positive" : "negative"}
        />
        <MiniStat
          label="Debt Service"
          value={formatMoneyCompact(fleet.debtService)}
          sub="separate cash burden"
          tone={fleet.debtService > 0 ? "negative" : "neutral"}
        />
        <MiniStat
          label="Cash After Debt Service"
          value={formatMoneyCompact(fleet.cashAfterDebtService)}
          sub={`${formatMoneyCompact(fleet.collectedRevenue)} collected`}
          tone={fleet.cashAfterDebtService >= 0 ? "positive" : "negative"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contribution by unit</CardTitle>
          {fleet.revenue === 0 && fleet.directCosts === 0 ? (
            <span className="text-2xs text-muted-foreground">
              No activity in {period.shortLabel} — open a unit to review or export it.
            </span>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Truck</TableHead>
                    <TableHead className="text-right">Loads</TableHead>
                    <TableHead className="text-right">Miles</TableHead>
                    <TableHead className="text-right">Deadhead</TableHead>
                    <TableHead className="text-right">Booked Revenue</TableHead>
                    <TableHead className="text-right">Its own costs</TableHead>
                    <TableHead className="text-right">Contribution</TableHead>
                    <TableHead className="text-right">$/mi</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fleet.units.map((unit) => (
                    <TableRow key={unit.truck.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/fleet/${unit.truck.id}?${periodQuery(period)}`}
                          className="block truncate text-primary hover:underline"
                        >
                          {unit.truck.name}
                        </Link>
                        {unit.truck.active ? null : (
                          <span className="text-2xs text-muted-foreground">Retired</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tnum">{unit.loadCount}</TableCell>
                      <TableCell className="text-right tnum">
                        {formatMiles(unit.totalMiles)}
                      </TableCell>
                      <TableCell className="text-right tnum text-muted-foreground">
                        {formatPercent(unit.deadheadPct)}
                      </TableCell>
                      <TableCell className="text-right tnum">
                        {formatMoneyCompact(unit.revenue)}
                      </TableCell>
                      <TableCell className="text-right tnum text-muted-foreground">
                        {formatMoneyCompact(unit.directCosts)}
                      </TableCell>
                      {/* Colour marks a unit that is losing money, not one that
                          simply earned less than its stablemate. */}
                      <TableCell
                        className={cn(
                          "text-right tnum font-semibold",
                          unit.contribution < 0 && "text-neg",
                        )}
                      >
                        {formatMoneyCompact(unit.contribution)}
                      </TableCell>
                      <TableCell className="text-right tnum">
                        {formatRateValue(unit.contributionPerMile)}
                      </TableCell>
                      <TableCell className="text-right tnum text-muted-foreground">
                        {unit.loadCount === 0 ? "--" : formatPercent(unit.shareOfContribution)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/fleet/${unit.truck.id}?${periodQuery(period)}`}
                          className="whitespace-nowrap text-xs font-medium text-primary hover:underline"
                        >
                          Open unit
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Where the money ends up</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Line label="Every truck's contribution" value={fleet.contribution} />
            <Line label="Less business overhead" value={-fleet.overhead} />
            <div className="flex items-center justify-between border-t border-border pt-2 font-semibold">
              <span>Operating Profit</span>
              <span className={cn("tnum", fleet.operatingProfit >= 0 ? "text-pos" : "text-neg")}>
                {formatMoney(fleet.operatingProfit)}
              </span>
            </div>
            <Line label="Less Debt Service (cash burden)" value={-fleet.debtService} />
            {fleet.unallocatedCollectedRevenue > 0 ? (
              <Line
                label="Paid Revenue without payment date (not assigned to cash)"
                value={fleet.unallocatedCollectedRevenue}
              />
            ) : null}
            <div className="flex items-center justify-between border-t border-border pt-2 font-semibold">
              <span>Cash After Debt Service</span>
              <span className={cn("tnum", fleet.cashAfterDebtService >= 0 ? "text-pos" : "text-neg")}>
                {formatMoney(fleet.cashAfterDebtService)}
              </span>
            </div>
            {/* Printed, not assumed. If these two ever disagree, the fleet
                view is the thing that is wrong. */}
            <p className="pt-1 text-2xs text-muted-foreground">
              The same {formatMoney(summary.operatingProfit)} Operating Profit the dashboard reports for {period.label}.
              Overhead is subtracted once, here, and never charged to a truck.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Read of the period</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {best && fleet.meaningful ? (
              <p>
                <span className="font-medium">{best.truck.name}</span> carried the fleet:{" "}
                {formatMoney(best.contribution)} on {formatMiles(best.totalMiles)}, or{" "}
                {formatRateValue(best.contributionPerMile)} a mile.
              </p>
            ) : (
              <p className="text-muted-foreground">
                Only one unit ran in {period.label}, so there is nothing to compare yet.
              </p>
            )}

            {weakest ? (
              <p>
                <span className="font-medium">{weakest.truck.name}</span> contributed the least:{" "}
                {formatMoney(weakest.contribution)} on {formatMiles(weakest.totalMiles)}, or{" "}
                {formatRateValue(weakest.contributionPerMile)} a mile
                {weakest.contribution < 0
                  ? " -- it did not cover the costs it caused."
                  : weakest.contributionPerMile > best!.contributionPerMile
                    ? ". It earns more per mile than the fleet leader; it simply drove fewer of them."
                    : "."}
              </p>
            ) : null}

            {idle.length > 0 ? (
              <p className="text-muted-foreground">
                {idle.map((unit) => unit.truck.name).join(", ")} ran no loads in {period.label}
                {idle.some((unit) => unit.directCosts > 0) ? " but still cost money." : "."}
              </p>
            ) : null}

            {fleet.totalMiles > 0 && fleet.overhead > 0 ? (
              <p className="border-t border-border pt-3 text-2xs text-muted-foreground">
                Overhead works out to {formatRateValue(fleet.overheadPerMile)} across every mile
                the fleet drove. That is an allocation for quoting work -- no truck was charged
                it.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tnum">{formatMoney(value)}</span>
    </div>
  );
}
