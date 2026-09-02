"use client";

import * as React from "react";
import { Gauge, Pencil, ShieldCheck, TruckIcon } from "lucide-react";

import { Metric } from "@/components/shared/metric";
import { TruckRetireButton } from "@/components/fleet/truck-retire-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TruckForm } from "@/components/truck/truck-form";
import { formatMoney, formatNumber, formatOdometer } from "@/lib/formatters";
import {
  iftaApplicability,
  iftaApplicabilityLabel,
  iftaReportingLabel,
} from "@/lib/ifta-eligibility";
import type { Truck } from "@/lib/types";
import { useLanguage } from "@/components/shell/language-provider";
import { interpolate } from "@/lib/i18n/dictionaries";

interface TruckOverviewProps {
  truck: Truck;
  odometerMiles: number;
  loadMiles: number;
  milesPerGallon: number | null;
  activeTruckCount: number;
  canRestore: boolean;
  profileIncomplete: boolean;
}

/** Read-first truck profile. Editing is an explicit, temporary mode. */
export function TruckOverview({
  truck,
  odometerMiles,
  loadMiles,
  milesPerGallon,
  activeTruckCount,
  canRestore,
  profileIncomplete,
}: TruckOverviewProps) {
  const { dictionary, locale } = useLanguage();
  const copy = dictionary.truck;
  const [editing, setEditing] = React.useState(false);
  const iftaStatus = iftaApplicability(truck);
  const identityIncomplete = ![truck.year, truck.make, truck.model].some(Boolean);

  if (editing) {
    return (
      <TruckForm
        truck={truck}
        onCancel={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />
    );
  }

  return (
    <section aria-labelledby="truck-information-title" className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="truck-information-title" className="text-sm font-semibold">
            {copy.truckInformation}
          </h2>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            {copy.informationDescription}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
          <Pencil className="size-4" />
          {copy.updateTruck}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="min-w-0">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Gauge className="size-3.5 text-muted-foreground" />
              <CardTitle>{copy.odometerFuel}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-5 gap-y-6 p-4 lg:p-5">
            <Metric label={copy.starting} value={formatOdometer(truck.startingOdometer)} sub="mi" />
            <Metric
              label={copy.current}
              value={formatOdometer(truck.currentOdometer)}
              sub={copy.latestReading}
            />
            <Metric
              label={copy.milesDriven}
              value={formatNumber(odometerMiles)}
              sub={copy.sincePurchase}
            />
            <Metric
              label={copy.lifetimeMpg}
              value={milesPerGallon ? milesPerGallon.toFixed(1) : "--"}
              sub={milesPerGallon ? copy.tankToTank : copy.needsReadings}
            />
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <div className="flex items-center gap-2">
              <TruckIcon className="size-3.5 text-muted-foreground" />
              <CardTitle>{copy.ownership}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-5 gap-y-6 p-4 lg:p-5">
            <Metric
              label={copy.purchasePrice}
              value={truck.purchasePrice ? formatMoney(truck.purchasePrice) : "--"}
            />
            <Metric
              label={copy.monthlyPayment}
              value={truck.monthlyPayment ? formatMoney(truck.monthlyPayment) : "--"}
              sub={truck.monthlyPayment ? copy.monthlyPrompts : undefined}
            />
            <Metric
              label={copy.monthlyInsurance}
              value={truck.monthlyInsurance ? formatMoney(truck.monthlyInsurance) : "--"}
              sub={truck.monthlyInsurance ? copy.monthlyPrompts : undefined}
            />
            <Metric label="VIN" value={truck.vin ?? "--"} valueClassName="text-xs font-mono" />
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-3.5 text-muted-foreground" />
              <CardTitle>{copy.unitStatus}</CardTitle>
            </div>
            <Badge
              variant={!truck.active ? "outline" : profileIncomplete ? "warning" : "positive"}
            >
              {!truck.active ? copy.outOfService : profileIncomplete ? copy.readySetup : copy.inService}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3 p-4 lg:p-5">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {truck.active
                ? profileIncomplete
                  ? copy.incompleteDescription
                  : copy.activeDescription
                : copy.retiredDescription}
            </p>
            <div className="rounded-lg border border-border bg-surface-sunken/60 p-3">
              <p className="text-2xs font-semibold text-foreground">{copy.iftaProfile}</p>
              <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">
                {iftaApplicabilityLabel(iftaStatus, locale)}.
                {iftaStatus === "LIKELY_REQUIRED"
                  ? ` ${copy.iftaTrack}`
                  : iftaStatus === "LIKELY_NOT_REQUIRED"
                    ? ` ${copy.iftaUpdate}`
                    : ` ${copy.iftaAdd}`}
              </p>
              <p className="mt-2 text-2xs leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">{copy.quarterlyFiling}</span>{" "}
                {iftaReportingLabel(truck.iftaReportingEnabled, locale)}.
              </p>
            </div>
            {activeTruckCount > 1 || !truck.active ? (
              <div className="rounded-lg border border-border bg-surface-sunken/60 p-3">
                <p className="mb-2.5 text-2xs leading-relaxed text-muted-foreground">
                  {truck.active
                    ? copy.takeOut
                    : copy.returnService}
                </p>
                <TruckRetireButton truck={truck} canRestore={canRestore} />
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-info/25 bg-info-soft p-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-info" />
                <p className="text-2xs leading-relaxed text-muted-foreground">
                  {profileIncomplete
                    ? identityIncomplete
                      ? "Skipping truck details kept this starter unit available because every load, expense, fuel purchase and service record must belong to a truck. Use Update truck when you are ready to complete it."
                      : iftaStatus === "UNKNOWN"
                        ? "This unit stays active, but its IFTA assessment is still unknown. Add axles, registered weight and operating area under Update truck."
                        : "This unit stays active, but its IFTA filing decision is still pending. Confirm whether to include or exclude it under Update truck."
                    : copy.onlyActive}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <p className="text-2xs leading-relaxed text-muted-foreground">
        {interpolate(copy.odometerExplanation, { miles: formatNumber(loadMiles) })}
      </p>
    </section>
  );
}
