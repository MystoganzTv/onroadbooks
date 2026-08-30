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
import type { Truck } from "@/lib/types";

interface TruckOverviewProps {
  truck: Truck;
  odometerMiles: number;
  milesPerGallon: number | null;
  activeTruckCount: number;
  canRestore: boolean;
}

/** Read-first truck profile. Editing is an explicit, temporary mode. */
export function TruckOverview({
  truck,
  odometerMiles,
  milesPerGallon,
  activeTruckCount,
  canRestore,
}: TruckOverviewProps) {
  const [editing, setEditing] = React.useState(false);

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
            Truck information
          </h2>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            Profile, ownership and current operating status for this unit.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
          <Pencil className="size-4" />
          Update truck
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="min-w-0">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Gauge className="size-3.5 text-muted-foreground" />
              <CardTitle>Odometer &amp; Fuel</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-5 gap-y-6 p-4 lg:p-5">
            <Metric label="Starting" value={formatOdometer(truck.startingOdometer)} sub="mi" />
            <Metric label="Current" value={formatOdometer(truck.currentOdometer)} sub="mi" />
            <Metric
              label="Miles Driven"
              value={formatNumber(odometerMiles)}
              sub="since purchase"
            />
            <Metric
              label="Lifetime MPG"
              value={milesPerGallon ? milesPerGallon.toFixed(1) : "--"}
              sub={milesPerGallon ? "tank to tank" : "needs 2 readings"}
            />
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <div className="flex items-center gap-2">
              <TruckIcon className="size-3.5 text-muted-foreground" />
              <CardTitle>Ownership</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-5 gap-y-6 p-4 lg:p-5">
            <Metric
              label="Purchase Price"
              value={truck.purchasePrice ? formatMoney(truck.purchasePrice) : "--"}
            />
            <Metric
              label="Monthly Payment"
              value={truck.monthlyPayment ? formatMoney(truck.monthlyPayment) : "--"}
            />
            <Metric
              label="Monthly Insurance"
              value={truck.monthlyInsurance ? formatMoney(truck.monthlyInsurance) : "--"}
            />
            <Metric label="VIN" value={truck.vin ?? "--"} valueClassName="text-xs font-mono" />
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-3.5 text-muted-foreground" />
              <CardTitle>Unit Status</CardTitle>
            </div>
            <Badge variant={truck.active ? "positive" : "outline"}>
              {truck.active ? "In service" : "Out of service"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3 p-4 lg:p-5">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {truck.active
                ? "This unit is available for new loads, expenses and service entries."
                : "This unit remains available in historical reports, but no new work can be assigned to it."}
            </p>
            {activeTruckCount > 1 || !truck.active ? (
              <div className="rounded-lg border border-border bg-surface-sunken/60 p-3">
                <p className="mb-2.5 text-2xs leading-relaxed text-muted-foreground">
                  {truck.active
                    ? "Taking a unit out of service never deletes its records. You can return it to service later."
                    : "Returning this unit to service makes it selectable for new activity and uses one available plan slot."}
                </p>
                <TruckRetireButton truck={truck} canRestore={canRestore} />
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-info/25 bg-info-soft p-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-info" />
                <p className="text-2xs leading-relaxed text-muted-foreground">
                  This is your only active truck, so it stays in service. Add another active unit
                  before taking this one out of service.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
