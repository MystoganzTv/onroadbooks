"use client";

import * as React from "react";
import { ArrowRight, Calculator, RotateCcw, Target } from "lucide-react";

import { LoadScoreBreakdown } from "@/components/cockpit/load-score-badge";
import { LoadFormDialog } from "@/components/loads/load-form-dialog";
import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RatingThresholds } from "@/lib/calculations";
import {
  calculateLoadEstimate,
  calculateTargetRate,
  type FeeMode,
} from "@/lib/finance/load-calculator";
import {
  formatMiles,
  formatMoney,
  formatMoneyCompact,
  formatPercent,
  formatRateValue,
} from "@/lib/formatters";
import type { Truck } from "@/lib/types";
import { cn, toNumber } from "@/lib/utils";

export interface CalculatorDefaults {
  fuelPrice: number;
  mpg: number;
  dispatchPct: number;
  factoringPct: number;
  overheadPerMile: number;
  trueCostPerMile: number;
  basisLabel: string;
  basisMiles: number;
  basisSufficient: boolean;
  targetProfitPerMile: number;
  deadheadWarnPct: number;
  thresholds: RatingThresholds;
  brokers: string[];
  trucks: Truck[];
  defaultDate: string;
}

interface Values {
  grossRate: string;
  loadedMiles: string;
  deadheadMiles: string;
  fuelPrice: string;
  mpg: string;
  tolls: string;
  dispatchMode: FeeMode;
  dispatchValue: string;
  factoringMode: FeeMode;
  factoringValue: string;
  otherCost: string;
  targetProfitPerMile: string;
}

function initialValues(defaults: CalculatorDefaults): Values {
  return {
    grossRate: "",
    loadedMiles: "",
    deadheadMiles: "0",
    fuelPrice: defaults.fuelPrice ? defaults.fuelPrice.toFixed(2) : "3.85",
    mpg: defaults.mpg ? defaults.mpg.toFixed(1) : "8.5",
    tolls: "",
    dispatchMode: "PCT",
    dispatchValue: defaults.dispatchPct ? String(defaults.dispatchPct) : "0",
    factoringMode: "PCT",
    factoringValue: defaults.factoringPct ? String(defaults.factoringPct) : "0",
    otherCost: "",
    targetProfitPerMile: defaults.targetProfitPerMile
      ? defaults.targetProfitPerMile.toFixed(2)
      : "1.50",
  };
}

/**
 * THE LOAD CALCULATOR.
 *
 * Used before saying yes to a broker, so everything recalculates as you type
 * and nothing is saved until you choose to save it. Both modes share one set
 * of inputs -- switching tabs keeps the miles and the fuel price you already
 * typed.
 *
 * All arithmetic comes from lib/finance/load-calculator. This component only
 * turns strings into numbers and numbers into layout.
 */
export function CalculatorPanel({ defaults }: { defaults: CalculatorDefaults }) {
  const [values, setValues] = React.useState<Values>(() => initialValues(defaults));
  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const shared = {
    loadedMiles: toNumber(values.loadedMiles),
    deadheadMiles: toNumber(values.deadheadMiles),
    fuelPrice: toNumber(values.fuelPrice),
    mpg: toNumber(values.mpg),
    tolls: toNumber(values.tolls),
    dispatchMode: values.dispatchMode,
    dispatchValue: toNumber(values.dispatchValue),
    factoringMode: values.factoringMode,
    factoringValue: toNumber(values.factoringValue),
    otherCost: toNumber(values.otherCost),
    overheadPerMile: defaults.overheadPerMile,
  };

  const estimate = calculateLoadEstimate(
    { ...shared, grossRate: toNumber(values.grossRate) },
    defaults.thresholds,
    defaults.deadheadWarnPct,
  );

  const target = calculateTargetRate(
    { ...shared, targetProfitPerMile: toNumber(values.targetProfitPerMile) },
    defaults.thresholds,
  );

  return (
    <Tabs defaultValue="evaluate" className="space-y-3">
      <TabsList>
        <TabsTrigger value="evaluate">
          <Calculator className="mr-1.5 size-3.5" />
          Should I take it?
        </TabsTrigger>
        <TabsTrigger value="target">
          <Target className="mr-1.5 size-3.5" />
          What should I ask?
        </TabsTrigger>
      </TabsList>

      <div className="grid gap-3 xl:grid-cols-5">
        {/* ---- Inputs ------------------------------------------------- */}
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader>
            <CardTitle>The load</CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setValues(initialValues(defaults))}
            >
              <RotateCcw className="size-3.5" />
              Reset
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            <TabsContent value="evaluate" className="m-0">
              <Field label="Gross rate offered" htmlFor="calc-gross">
                <Input
                  id="calc-gross"
                  inputMode="decimal"
                  placeholder="700"
                  value={values.grossRate}
                  onChange={(e) => set("grossRate", e.target.value)}
                />
              </Field>
            </TabsContent>
            <TabsContent value="target" className="m-0">
              <Field
                label="Profit per mile you want"
                htmlFor="calc-target-ppm"
                hint="After fuel, tolls, fees and the truck's overhead"
              >
                <Input
                  id="calc-target-ppm"
                  inputMode="decimal"
                  placeholder="1.50"
                  value={values.targetProfitPerMile}
                  onChange={(e) => set("targetProfitPerMile", e.target.value)}
                />
              </Field>
            </TabsContent>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Loaded miles" htmlFor="calc-loaded">
                <Input
                  id="calc-loaded"
                  inputMode="numeric"
                  placeholder="407"
                  value={values.loadedMiles}
                  onChange={(e) => set("loadedMiles", e.target.value)}
                />
              </Field>
              <Field
                label="Deadhead to pickup"
                htmlFor="calc-deadhead"
                hint="Always counted"
              >
                <Input
                  id="calc-deadhead"
                  inputMode="numeric"
                  placeholder="84"
                  value={values.deadheadMiles}
                  onChange={(e) => set("deadheadMiles", e.target.value)}
                />
              </Field>
              <Field label="Fuel price / gal" htmlFor="calc-fuel">
                <Input
                  id="calc-fuel"
                  inputMode="decimal"
                  value={values.fuelPrice}
                  onChange={(e) => set("fuelPrice", e.target.value)}
                />
              </Field>
              <Field label="Truck MPG" htmlFor="calc-mpg">
                <Input
                  id="calc-mpg"
                  inputMode="decimal"
                  value={values.mpg}
                  onChange={(e) => set("mpg", e.target.value)}
                />
              </Field>
              <Field label="Estimated tolls" htmlFor="calc-tolls">
                <Input
                  id="calc-tolls"
                  inputMode="decimal"
                  placeholder="38"
                  value={values.tolls}
                  onChange={(e) => set("tolls", e.target.value)}
                />
              </Field>
              <Field label="Other cost" htmlFor="calc-other" hint="Lumper, scale, permit">
                <Input
                  id="calc-other"
                  inputMode="decimal"
                  value={values.otherCost}
                  onChange={(e) => set("otherCost", e.target.value)}
                />
              </Field>
            </div>

            <FeeField
              id="dispatch"
              label="Dispatch fee"
              mode={values.dispatchMode}
              value={values.dispatchValue}
              onMode={(mode) => set("dispatchMode", mode)}
              onValue={(value) => set("dispatchValue", value)}
            />
            <FeeField
              id="factoring"
              label="Factoring fee"
              mode={values.factoringMode}
              value={values.factoringValue}
              onMode={(mode) => set("factoringMode", mode)}
              onValue={(value) => set("factoringValue", value)}
            />

            <div className="rounded-md border border-dashed border-border bg-surface-sunken/50 p-3">
              <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                Your truck&apos;s own numbers
              </p>
              <dl className="mt-2 space-y-1">
                <BasisRow
                  label="True cost / mile"
                  value={
                    defaults.basisSufficient
                      ? formatRateValue(defaults.trueCostPerMile)
                      : "Not enough data"
                  }
                />
                <BasisRow
                  label="Overhead / mile used here"
                  value={formatRateValue(defaults.overheadPerMile)}
                />
              </dl>
              <p className="mt-2 text-2xs leading-relaxed text-muted-foreground">
                {defaults.basisSufficient ? (
                  <>
                    From {defaults.basisLabel.toLowerCase()} (
                    {formatMiles(defaults.basisMiles)}). Overhead excludes fuel, tolls, dispatch
                    and factoring because you enter those above — counting them twice is how a
                    calculator flatters a bad load.
                  </>
                ) : (
                  <>
                    Not enough recorded miles yet, so overhead is treated as $0.00 and the profit
                    shown is a trip-cost profit only. Record loads and expenses and this fills in.
                  </>
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ---- Results ------------------------------------------------ */}
        <div className="min-w-0 space-y-3 xl:col-span-3">
          <TabsContent value="evaluate" className="m-0 space-y-3">
            <EvaluateResult
              estimate={estimate}
              defaults={defaults}
              values={values}
            />
          </TabsContent>
          <TabsContent value="target" className="m-0 space-y-3">
            <TargetResult target={target} values={values} />
          </TabsContent>
        </div>
      </div>
    </Tabs>
  );
}

/* ---- Evaluate --------------------------------------------------------- */

function EvaluateResult({
  estimate,
  defaults,
  values,
}: {
  estimate: ReturnType<typeof calculateLoadEstimate>;
  defaults: CalculatorDefaults;
  values: Values;
}) {
  if (!estimate.valid) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Enter loaded miles and MPG to price the load.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Estimated result</CardTitle>
          <span className="text-2xs text-muted-foreground tnum">
            {formatMiles(estimate.totalMiles)} total ·{" "}
            {formatPercent(estimate.deadheadPct, 0)} deadhead
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <dl className="divide-y divide-border/70">
            <Line label="Gross rate" value={formatMoney(toNumber(values.grossRate))} strong />
            {estimate.lines.map((line) => (
              <Line
                key={line.key}
                label={line.label}
                hint={line.note}
                value={`-${formatMoney(line.amount)}`}
                tone="neg"
              />
            ))}
          </dl>

          <div
            className={cn(
              "flex items-end justify-between gap-4 border-t-2 px-4 py-4",
              estimate.profit >= 0
                ? "border-pos/40 bg-pos-soft/40"
                : "border-neg/40 bg-neg-soft/40",
            )}
          >
            <div>
              <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Estimated profit
              </p>
              <p className="mt-1 text-2xs text-muted-foreground tnum">
                {formatPercent(estimate.profitMargin)} margin ·{" "}
                {formatRateValue(estimate.costPerMile)}/mi to run
              </p>
            </div>
            <div className="text-right">
              <p
                className={cn(
                  "tnum text-3xl font-semibold leading-none tracking-tight",
                  estimate.profit >= 0 ? "text-pos" : "text-neg",
                )}
              >
                {formatMoneyCompact(estimate.profit)}
              </p>
              <p
                className={cn(
                  "mt-1 tnum text-sm font-medium",
                  estimate.profitPerMile >= 0 ? "text-pos" : "text-neg",
                )}
              >
                {formatRateValue(estimate.profitPerMile)}/mi
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <LoadScoreBreakdown score={estimate.score} showBasis="loaded" />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">Ran this load?</p>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              Carry these numbers straight into a load record.
            </p>
          </div>
          <LoadFormDialog
            brokers={defaults.brokers}
            trucks={defaults.trucks}
            defaultDate={defaults.defaultDate}
            ratingThresholds={defaults.thresholds}
            prefill={{
              loadedMiles: toNumber(values.loadedMiles),
              deadheadMiles: toNumber(values.deadheadMiles),
              grossRate: toNumber(values.grossRate),
              fuelCost: estimate.fuelCost,
              tolls: estimate.tolls,
              dispatchFee: estimate.dispatch,
              factoringFee: estimate.factoring,
              otherExpenses: estimate.otherCost,
            }}
            trigger={
              <Button type="button" variant="outline" size="sm">
                Save as a load
                <ArrowRight className="size-3.5" />
              </Button>
            }
          />
        </CardContent>
      </Card>

      <p className="px-1 text-2xs leading-relaxed text-muted-foreground">
        An estimate from your own cost history, not a quote. Fuel burn, tolls and fees on the day
        decide the real number.
      </p>
    </>
  );
}

/* ---- Target rate ------------------------------------------------------ */

const TIER_TONE: Record<string, string> = {
  breakeven: "border-border bg-surface-sunken",
  minimum: "border-warn/40 bg-warn-soft",
  good: "border-info/40 bg-info-soft",
  great: "border-pos/40 bg-pos-soft",
  target: "border-primary/50 bg-primary/10",
};

function TargetResult({
  target,
  values,
}: {
  target: ReturnType<typeof calculateTargetRate>;
  values: Values;
}) {
  if (target.impossible) {
    return (
      <Card className="border-neg/40">
        <CardContent className="p-6">
          <p className="text-sm text-neg">
            Dispatch and factoring together take 100% or more of the gross. No rate can clear a
            profit until those come down.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!target.valid) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Enter loaded miles and MPG to work out what to quote.
          </p>
        </CardContent>
      </Card>
    );
  }

  const feePct = (target.grossFeeRate * 100).toFixed(1);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>What to quote</CardTitle>
          <span className="text-2xs text-muted-foreground tnum">
            {formatMiles(target.totalMiles)} total
          </span>
        </CardHeader>
        <CardContent className="space-y-2 p-4">
          {target.tiers.map((tier) => (
            <div
              key={tier.key}
              className={cn(
                "flex items-center justify-between gap-4 rounded-md border px-3.5 py-3",
                TIER_TONE[tier.key],
              )}
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide">{tier.label}</p>
                <p className="mt-0.5 text-2xs opacity-80">{tier.description}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="tnum text-xl font-semibold leading-none tracking-tight">
                  {formatMoneyCompact(tier.rate)}
                </p>
                <p className="mt-1 text-2xs opacity-70 tnum">
                  {formatRateValue(tier.ratePerLoadedMile)}/loaded mi
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How that was worked out</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4">
          <dl className="divide-y divide-border/70">
            <Line
              label="Fuel"
              hint={`${target.gallons.toFixed(1)} gal at $${toNumber(values.fuelPrice).toFixed(2)}/gal`}
              value={formatMoney(target.fuelCost)}
            />
            <Line label="Tolls" value={formatMoney(target.tolls)} />
            <Line label="Other cost" value={formatMoney(target.otherCost)} />
            <Line
              label="Truck overhead"
              hint={`${formatMiles(target.totalMiles)} of overhead`}
              value={formatMoney(target.overhead)}
            />
            {target.flatFees > 0 ? (
              <Line label="Flat dispatch / factoring" value={formatMoney(target.flatFees)} />
            ) : null}
            <Line
              label="Costs that do not move with the rate"
              value={formatMoney(target.fixedTripCost)}
              strong
            />
          </dl>

          <div className="rounded-md border border-border bg-surface-sunken/60 p-3">
            <p className="text-2xs leading-relaxed text-muted-foreground">
              Dispatch and factoring are {feePct}% of whatever the rate ends up being, so they
              cannot simply be added on. The rate is solved for instead:
            </p>
            <p className="mt-2 rounded bg-card px-2.5 py-2 font-mono text-2xs text-foreground">
              rate = (costs + profit wanted) ÷ (1 − {(target.grossFeeRate).toFixed(3)})
            </p>
            <p className="mt-2 text-2xs text-muted-foreground tnum">
              Costs {formatMoney(target.fixedTripCost)} · {formatRateValue(target.costPerMile)} per
              total mile before any profit.
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/* ---- Small pieces ------------------------------------------------------ */

function FeeField({
  id,
  label,
  mode,
  value,
  onMode,
  onValue,
}: {
  id: string;
  label: string;
  mode: FeeMode;
  value: string;
  onMode: (mode: FeeMode) => void;
  onValue: (value: string) => void;
}) {
  return (
    <Field label={label} htmlFor={`calc-${id}`}>
      <div className="flex gap-2">
        <Input
          id={`calc-${id}`}
          inputMode="decimal"
          value={value}
          onChange={(e) => onValue(e.target.value)}
          className="flex-1"
        />
        <div
          className="flex shrink-0 overflow-hidden rounded-md border border-border"
          role="group"
          aria-label={`${label} unit`}
        >
          {(["PCT", "AMOUNT"] as FeeMode[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => onMode(option)}
              className={cn(
                "px-2.5 text-xs font-medium transition-colors focus-ring",
                mode === option
                  ? "bg-primary text-primary-foreground"
                  : "bg-transparent text-muted-foreground hover:bg-accent",
              )}
            >
              {option === "PCT" ? "%" : "$"}
            </button>
          ))}
        </div>
      </div>
    </Field>
  );
}

function BasisRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-2xs text-muted-foreground">{label}</dt>
      <dd className="tnum text-2xs font-medium text-foreground">{value}</dd>
    </div>
  );
}

function Line({
  label,
  hint,
  value,
  tone,
  strong,
}: {
  label: string;
  hint?: string;
  value: string;
  tone?: "neg";
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
      <dt className="min-w-0">
        <span
          className={cn(
            "text-xs",
            strong ? "font-semibold text-foreground" : "text-muted-foreground",
          )}
        >
          {label}
        </span>
        {hint ? (
          <span className="ml-1.5 text-2xs text-muted-foreground/70">{hint}</span>
        ) : null}
      </dt>
      <dd
        className={cn(
          "shrink-0 tnum",
          strong ? "text-md font-semibold" : "text-sm",
          tone === "neg" ? "text-neg" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
