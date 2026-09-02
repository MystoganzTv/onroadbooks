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
import { formatLocalePeriod } from "@/lib/i18n-format";
import { getWebDictionary, interpolate } from "@/lib/i18n/dictionaries";
import { getAppLocale } from "@/lib/i18n-server";
import { periodFromSearchParams, periodQuery, type SearchParams } from "@/lib/period-params";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).fleet.metadataTitle };
}

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
  const [params, session, locale] = await Promise.all([
    searchParams,
    requireSession(),
    getAppLocale(),
  ]);
  const copy = getWebDictionary(locale).fleet;
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
  const periodShort = formatLocalePeriod(period, locale, "short");
  const periodLong = formatLocalePeriod(period, locale);

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
      />

      <PeriodControls period={period} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <MiniStat
          label={copy.bookedRevenue}
          value={formatMoneyCompact(fleet.revenue)}
          sub={`${loadCount} ${loadCount === 1 ? copy.load : copy.loads}`}
          tone="info"
        />
        <MiniStat
          label={copy.contribution}
          value={formatMoneyCompact(fleet.contribution)}
          sub={copy.afterTruckCosts}
        />
        <MiniStat
          label={copy.overhead}
          value={formatMoneyCompact(fleet.overhead)}
          sub={copy.noSingleTruck}
        />
        <MiniStat
          label={copy.operatingProfit}
          value={formatMoneyCompact(fleet.operatingProfit)}
          sub={periodShort}
          tone={fleet.operatingProfit >= 0 ? "positive" : "negative"}
        />
        <MiniStat
          label={copy.debtFinancing}
          value={formatMoneyCompact(fleet.debtService)}
          sub={copy.separateCashBurden}
          tone={fleet.debtService > 0 ? "negative" : "neutral"}
        />
        <MiniStat
          label={copy.cashAfterDebt}
          value={formatMoneyCompact(fleet.cashAfterDebtService)}
          sub={interpolate(copy.amountCollected, {
            amount: formatMoneyCompact(fleet.collectedRevenue),
          })}
          tone={fleet.cashAfterDebtService >= 0 ? "positive" : "negative"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{copy.contributionByUnit}</CardTitle>
          {fleet.revenue === 0 && fleet.directCosts === 0 ? (
            <span className="text-2xs text-muted-foreground">
              {interpolate(copy.noActivity, { period: periodShort })}
            </span>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{copy.truck}</TableHead>
                    <TableHead className="text-right">{copy.loads}</TableHead>
                    <TableHead className="text-right">{copy.miles}</TableHead>
                    <TableHead className="text-right">{copy.deadhead}</TableHead>
                    <TableHead className="text-right">{copy.bookedRevenue}</TableHead>
                    <TableHead className="text-right">{copy.ownCosts}</TableHead>
                    <TableHead className="text-right">{copy.contribution}</TableHead>
                    <TableHead className="text-right">$/mi</TableHead>
                    <TableHead className="text-right">{copy.details}</TableHead>
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
                          <span className="text-2xs text-muted-foreground">{copy.retired}</span>
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
                      <TableCell className="text-right">
                        <Link
                          href={`/fleet/${unit.truck.id}?${periodQuery(period)}`}
                          className="whitespace-nowrap text-xs font-medium text-primary hover:underline"
                        >
                          {copy.openUnit}
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
            <CardTitle>{copy.moneyDestination}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Line label={copy.everyTruckContribution} value={fleet.contribution} />
            <Line label={copy.lessOverhead} value={-fleet.overhead} />
            <div className="flex items-center justify-between border-t border-border pt-2 font-semibold">
              <span>{copy.operatingProfit}</span>
              <span className={cn("tnum", fleet.operatingProfit >= 0 ? "text-pos" : "text-neg")}>
                {formatMoney(fleet.operatingProfit)}
              </span>
            </div>
            <Line label={copy.lessDebt} value={-fleet.debtService} />
            {fleet.unallocatedCollectedRevenue > 0 ? (
              <Line
                label={copy.missingPaymentDate}
                value={fleet.unallocatedCollectedRevenue}
              />
            ) : null}
            <div className="flex items-center justify-between border-t border-border pt-2 font-semibold">
              <span>{copy.cashAfterDebt}</span>
              <span className={cn("tnum", fleet.cashAfterDebtService >= 0 ? "text-pos" : "text-neg")}>
                {formatMoney(fleet.cashAfterDebtService)}
              </span>
            </div>
            {/* Printed, not assumed. If these two ever disagree, the fleet
                view is the thing that is wrong. */}
            <p className="pt-1 text-2xs text-muted-foreground">
              {interpolate(copy.reconciliation, {
                amount: formatMoney(summary.operatingProfit),
                period: periodLong,
              })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{copy.periodRead}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {best && fleet.meaningful ? (
              <p>{interpolate(copy.leaderRead, {
                truck: best.truck.name,
                amount: formatMoney(best.contribution),
                miles: formatMiles(best.totalMiles),
                rate: formatRateValue(best.contributionPerMile),
              })}</p>
            ) : (
              <p className="text-muted-foreground">
                {interpolate(copy.onlyOneUnit, { period: periodLong })}
              </p>
            )}

            {weakest ? (
              <p>{interpolate(copy.weakestRead, {
                truck: weakest.truck.name,
                amount: formatMoney(weakest.contribution),
                miles: formatMiles(weakest.totalMiles),
                rate: formatRateValue(weakest.contributionPerMile),
                ending: weakest.contribution < 0
                  ? copy.didNotCover
                  : weakest.contributionPerMile > best!.contributionPerMile
                    ? copy.betterRateFewerMiles
                    : ".",
              })}</p>
            ) : null}

            {idle.length > 0 ? (
              <p className="text-muted-foreground">
                {interpolate(copy.idleRead, {
                  trucks: idle.map((unit) => unit.truck.name).join(", "),
                  period: periodLong,
                  ending: idle.some((unit) => unit.directCosts > 0)
                    ? copy.stillCostMoney
                    : ".",
                })}
              </p>
            ) : null}

            {fleet.totalMiles > 0 && fleet.overhead > 0 ? (
              <p className="border-t border-border pt-3 text-2xs text-muted-foreground">
                {interpolate(copy.overheadPerMile, {
                  rate: formatRateValue(fleet.overheadPerMile),
                })}
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
