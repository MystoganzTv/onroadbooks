"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguage } from "@/components/shell/language-provider";
import type { LoadProfitability } from "@/lib/finance/load-perspectives";
import { formatMiles, formatMoney, formatPercent, formatRateValue } from "@/lib/formatters";
import { interpolate } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

/**
 * One load, three questions -- Business, Driver, Owner-Operator -- from a
 * single `LoadProfitability`, so no view computes its own numbers. See
 * lib/finance/load-perspectives.ts for why they are kept apart.
 */
export function LoadProfitabilityCard({
  profitability,
  allocatedRate,
  basisLabel,
}: {
  profitability: LoadProfitability;
  allocatedRate: number;
  basisLabel: string;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.loads.perspectives;
  const { business, driver, ownerOperator } = profitability;
  const perMile = (value: number) => `${formatRateValue(value)}/mi`;

  return (
    <Card>
      <Tabs defaultValue="business">
        <CardHeader className="flex-wrap gap-2">
          <CardTitle>{copy.title}</CardTitle>
          <TabsList aria-label={copy.title}>
            <TabsTrigger value="business">{copy.business}</TabsTrigger>
            <TabsTrigger value="driver">{copy.driver}</TabsTrigger>
            <TabsTrigger value="owner">{copy.owner}</TabsTrigger>
          </TabsList>
        </CardHeader>

        <CardContent className="p-4">
          <TabsContent value="business" className="mt-0 space-y-3">
            <p className="text-xs text-muted-foreground">{copy.businessQuestion}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label={copy.grossRevenue} value={formatMoney(business.grossRevenue)} />
              <Stat label={copy.grossRpm} value={perMile(business.grossRpm)} sub={`${copy.loadedRpm} ${perMile(business.loadedRpm)}`} />
              <Stat
                label={copy.totalMiles}
                value={formatMiles(business.totalMiles)}
                sub={interpolate(copy.milesBreakdown, {
                  loaded: formatMiles(business.loadedMiles),
                  deadhead: formatMiles(business.deadheadMiles),
                })}
              />
              <Stat
                label={copy.contributionMargin}
                value={formatPercent(business.contributionMargin)}
                tone={business.contributionProfit >= 0 ? "pos" : "neg"}
              />
            </div>
            <Separator />
            <Step label={copy.grossRevenue} value={business.grossRevenue} />
            <Step label={copy.directTripCosts} hint={copy.directTripCostsHint} value={-business.directTripCosts} />
            <Step
              label={copy.driverCompensation}
              hint={business.driverCompensationExpected ? copy.expected : undefined}
              value={-business.driverCompensation}
            />
            <Step
              label={copy.contributionProfit}
              value={business.contributionProfit}
              aside={perMile(business.contributionPerMile)}
              strong
            />
            {business.allocationAvailable ? (
              <>
                <Step
                  label={copy.allocatedOperatingCosts}
                  hint={interpolate(copy.allocatedHint, {
                    miles: formatMiles(business.totalMiles),
                    rate: formatRateValue(allocatedRate),
                    basis: basisLabel,
                  })}
                  value={-business.allocatedOperatingCosts}
                />
                <Step
                  label={copy.estimatedNetBusinessProfit}
                  value={business.estimatedNetBusinessProfit}
                  aside={perMile(business.netProfitPerMile)}
                  strong
                />
              </>
            ) : (
              <Pending label={copy.estimatedNetBusinessProfit} note={copy.allocationUnavailable} />
            )}
            <Separator />
            <Step label={copy.debtService} hint={copy.debtHint} value={-business.debtServiceBurden} muted />
            {profitability.noDriverPay ? (
              <p className="rounded-md border border-warn/35 bg-warn-soft/45 px-3 py-2 text-2xs leading-relaxed text-foreground">
                {copy.noDriverPay}
              </p>
            ) : null}
          </TabsContent>

          <TabsContent value="driver" className="mt-0 space-y-3">
            <p className="text-xs text-muted-foreground">{copy.driverQuestion}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label={copy.driverCompensation}
                value={formatMoney(driver.driverCompensation)}
                sub={driver.expected ? copy.expected : undefined}
              />
              <Stat label={copy.payPerTotalMile} value={perMile(driver.payPerTotalMile)} sub={formatMiles(driver.totalMiles)} />
              <Stat label={copy.payPerLoadedMile} value={perMile(driver.payPerLoadedMile)} sub={formatMiles(driver.loadedMiles)} />
              <Stat
                label={copy.payPerHour}
                value={driver.payPerHour === null ? "—" : `${formatMoney(driver.payPerHour)}/h`}
                sub={driver.tripHours === null ? copy.hours : `${driver.tripHours} h`}
              />
            </div>
            {driver.tripHours === null ? (
              <p className="text-2xs text-muted-foreground">{copy.hoursNotRecorded}</p>
            ) : null}
            <p className="text-2xs text-muted-foreground">{copy.driverNote}</p>
          </TabsContent>

          <TabsContent value="owner" className="mt-0 space-y-3">
            <p className="text-xs text-muted-foreground">{copy.ownerQuestion}</p>
            {ownerOperator ? (
              <>
                <Step label={copy.ownerEconomicBenefit} value={ownerOperator.ownerEconomicBenefit} strong />
                <div className="space-y-2 border-l-2 border-border pl-3">
                  <Step label={copy.driverCompensation} value={ownerOperator.driverCompensation} />
                  <Step label={copy.businessContribution} value={ownerOperator.businessContribution} />
                </div>
                <p className="text-2xs leading-relaxed text-muted-foreground">{copy.ownerExplain}</p>
                <Separator />
                {business.allocationAvailable ? (
                  <Step label={copy.estimatedNetBusinessProfit} value={ownerOperator.estimatedNetBusinessProfit} />
                ) : (
                  <Pending label={copy.estimatedNetBusinessProfit} note={copy.allocationUnavailable} />
                )}
              </>
            ) : (
              <p className="rounded-md border border-border bg-surface-sunken px-3 py-2 text-xs text-muted-foreground">
                {copy.ownerNotApplicable}
              </p>
            )}
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
}

function Pending({ label, note }: { label: string; note: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="min-w-0 text-sm text-muted-foreground">
        {label}
        <span className="ml-1.5 text-2xs text-muted-foreground">{note}</span>
      </span>
      <span className="tnum text-sm text-muted-foreground">—</span>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "pos" | "neg" }) {
  return (
    <div className="min-w-0">
      <p className="label-xs">{label}</p>
      <p className={cn("mt-0.5 tnum text-sm font-semibold", tone === "pos" && "text-pos", tone === "neg" && "text-neg")}>{value}</p>
      {sub ? <p className="truncate text-2xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function Step({
  label,
  hint,
  value,
  aside,
  strong,
  muted,
}: {
  label: string;
  hint?: string;
  value: number;
  aside?: string;
  strong?: boolean;
  muted?: boolean;
}) {
  const negative = value < 0 && Math.abs(value) >= 0.005;
  return (
    <div className={cn("flex items-baseline justify-between gap-4", muted && "opacity-70")}>
      <span className={cn("min-w-0 text-sm", strong ? "font-semibold text-foreground" : "text-muted-foreground")}>
        {label}
        {hint ? <span className="ml-1.5 text-2xs font-normal text-muted-foreground">{hint}</span> : null}
      </span>
      <span className="flex shrink-0 items-baseline gap-2">
        {aside ? <span className="tnum text-2xs text-muted-foreground">{aside}</span> : null}
        <span className={cn("tnum text-sm", strong && "font-semibold", negative && "text-neg")}>
          {negative ? `-${formatMoney(Math.abs(value))}` : formatMoney(value)}
        </span>
      </span>
    </div>
  );
}
