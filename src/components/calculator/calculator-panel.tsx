"use client";

import * as React from "react";
import { ArrowRight, Calculator, RotateCcw, Target } from "lucide-react";

import { LoadScoreBreakdown } from "@/components/cockpit/load-score-badge";
import { LoadFormDialog } from "@/components/loads/load-form-dialog";
import { Field } from "@/components/shared/field";
import { useLanguage } from "@/components/shell/language-provider";
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
import { interpolate } from "@/lib/i18n/dictionaries";
import { cn, toNumber } from "@/lib/utils";

export interface CalculatorDefaults {
  fuelPrice: number;
  mpg: number;
  dispatchPct: number;
  factoringPct: number;
  overheadPerMile: number;
  debtServicePerMile: number;
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
  const { dictionary } = useLanguage();
  const copy = dictionary.calculator;
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
    debtServicePerMile: defaults.debtServicePerMile,
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
          {copy.evaluateTab}
        </TabsTrigger>
        <TabsTrigger value="target">
          <Target className="mr-1.5 size-3.5" />
          {copy.targetTab}
        </TabsTrigger>
      </TabsList>

      <div className="grid gap-3 xl:grid-cols-5">
        {/* ---- Inputs ------------------------------------------------- */}
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader>
            <CardTitle>{copy.theLoad}</CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setValues(initialValues(defaults))}
            >
              <RotateCcw className="size-3.5" />
              {copy.reset}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            <TabsContent value="evaluate" className="m-0">
              <Field label={copy.grossOffered} htmlFor="calc-gross">
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
                label={copy.targetProfit}
                htmlFor="calc-target-ppm"
                hint={copy.targetProfitHint}
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
              <Field label={copy.loadedMiles} htmlFor="calc-loaded">
                <Input
                  id="calc-loaded"
                  inputMode="numeric"
                  placeholder="407"
                  value={values.loadedMiles}
                  onChange={(e) => set("loadedMiles", e.target.value)}
                />
              </Field>
              <Field
                label={copy.deadheadPickup}
                htmlFor="calc-deadhead"
                hint={copy.alwaysCounted}
              >
                <Input
                  id="calc-deadhead"
                  inputMode="numeric"
                  placeholder="84"
                  value={values.deadheadMiles}
                  onChange={(e) => set("deadheadMiles", e.target.value)}
                />
              </Field>
              <Field label={copy.fuelPrice} htmlFor="calc-fuel">
                <Input
                  id="calc-fuel"
                  inputMode="decimal"
                  value={values.fuelPrice}
                  onChange={(e) => set("fuelPrice", e.target.value)}
                />
              </Field>
              <Field label={copy.truckMpg} htmlFor="calc-mpg">
                <Input
                  id="calc-mpg"
                  inputMode="decimal"
                  value={values.mpg}
                  onChange={(e) => set("mpg", e.target.value)}
                />
              </Field>
              <Field label={copy.estimatedTolls} htmlFor="calc-tolls">
                <Input
                  id="calc-tolls"
                  inputMode="decimal"
                  placeholder="38"
                  value={values.tolls}
                  onChange={(e) => set("tolls", e.target.value)}
                />
              </Field>
              <Field label={copy.otherCost} htmlFor="calc-other" hint={copy.otherCostHint}>
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
              label={copy.dispatchFee}
              mode={values.dispatchMode}
              value={values.dispatchValue}
              onMode={(mode) => set("dispatchMode", mode)}
              onValue={(value) => set("dispatchValue", value)}
            />
            <FeeField
              id="factoring"
              label={copy.factoringFee}
              mode={values.factoringMode}
              value={values.factoringValue}
              onMode={(mode) => set("factoringMode", mode)}
              onValue={(value) => set("factoringValue", value)}
            />

            <div className="rounded-md border border-dashed border-border bg-surface-sunken/50 p-3">
              <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                {copy.ownNumbers}
              </p>
              <dl className="mt-2 space-y-1">
                <BasisRow
                label={copy.normalizedCost}
                  value={
                    defaults.basisSufficient
                      ? formatRateValue(defaults.trueCostPerMile)
                      : copy.notEnoughData
                  }
                />
                <BasisRow
                  label={copy.allocatedCost}
                  value={formatRateValue(defaults.overheadPerMile)}
                />
                <BasisRow
                  label={copy.debtPerMile}
                  value={formatRateValue(defaults.debtServicePerMile)}
                />
              </dl>
              <p className="mt-2 text-2xs leading-relaxed text-muted-foreground">
                {defaults.basisSufficient ? (
                  <>
                    {interpolate(copy.sufficientBasis, {
                      basis: defaults.basisLabel.toLowerCase(),
                      miles: formatMiles(defaults.basisMiles),
                    })}
                  </>
                ) : (
                  <>
                    {copy.insufficientBasis}
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
  const { dictionary } = useLanguage();
  const copy = dictionary.calculator;
  const lineCopy = (line: (typeof estimate.lines)[number]) => {
    const label = line.key === "fuel"
      ? copy.fuel
      : line.key === "tolls"
        ? copy.tolls
        : line.key === "dispatch"
          ? copy.dispatch
          : line.key === "factoring"
            ? copy.factoring
            : copy.otherCosts;
    const hint = line.key === "fuel"
      ? toNumber(values.mpg) > 0
        ? interpolate(copy.fuelLineHint, {
            gallons: estimate.gallons.toFixed(1),
            price: `$${toNumber(values.fuelPrice).toFixed(2)}`,
            mpg: toNumber(values.mpg).toFixed(1),
          })
        : copy.enterMpg
      : line.key === "dispatch"
        ? values.dispatchMode === "PCT"
          ? interpolate(copy.percentGross, { percent: values.dispatchValue })
          : copy.flatFee
        : line.key === "factoring"
          ? values.factoringMode === "PCT"
            ? interpolate(copy.percentGross, { percent: values.factoringValue })
            : copy.flatFee
          : undefined;
    return { label, hint };
  };
  if (!estimate.valid) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {copy.enterEvaluate}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{copy.estimatedResult}</CardTitle>
          <span className="text-2xs text-muted-foreground tnum">
            {interpolate(copy.totalDeadhead, {
              miles: formatMiles(estimate.totalMiles),
              percent: formatPercent(estimate.deadheadPct, 0),
            })}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <dl className="divide-y divide-border/70">
            <Line label={copy.grossRate} value={formatMoney(toNumber(values.grossRate))} strong />
            {estimate.lines.map((line) => (
              <Line
                key={line.key}
                label={lineCopy(line).label}
                hint={lineCopy(line).hint}
                value={`-${formatMoney(line.amount)}`}
                tone="neg"
              />
            ))}
            <Line
              label={copy.contributionProfit}
              hint={copy.contributionHint}
              value={formatMoney(estimate.contributionProfit)}
              tone={estimate.contributionProfit >= 0 ? undefined : "neg"}
              strong
            />
            <Line
              label={copy.allocatedCosts}
              hint={copy.allocatedHint}
              value={`-${formatMoney(estimate.allocatedOperatingCosts)}`}
              tone="neg"
            />
            <Line
              label={copy.estimatedProfit}
              value={formatMoney(estimate.fullyLoadedOperatingProfit)}
              tone={estimate.fullyLoadedOperatingProfit >= 0 ? undefined : "neg"}
              strong
            />
            <Line
              label={copy.debtFinancing}
              hint={copy.debtHint}
              value={`-${formatMoney(estimate.debtService)}`}
              tone="neg"
            />
            <Line
              label={copy.cashAfterDebt}
              value={formatMoney(estimate.cashAfterDebtService)}
              tone={estimate.cashAfterDebtService >= 0 ? undefined : "neg"}
              strong
            />
          </dl>

          <div
            className={cn(
              "flex items-end justify-between gap-4 border-t-2 px-4 py-4",
              estimate.contributionProfit >= 0
                ? "border-pos/40 bg-pos-soft/40"
                : "border-neg/40 bg-neg-soft/40",
            )}
          >
            <div>
              <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {copy.ratingBasis}
              </p>
              <p className="mt-1 text-2xs text-muted-foreground tnum">
                {interpolate(copy.marginDirect, {
                  percent: formatPercent(estimate.contributionMargin),
                })}
              </p>
            </div>
            <div className="text-right">
              <p
                className={cn(
                  "tnum text-3xl font-semibold leading-none tracking-tight",
                  estimate.contributionProfit >= 0 ? "text-pos" : "text-neg",
                )}
              >
                {formatMoneyCompact(estimate.contributionProfit)}
              </p>
              <p
                className={cn(
                  "mt-1 tnum text-sm font-medium",
                  estimate.contributionProfitPerMile >= 0 ? "text-pos" : "text-neg",
                )}
              >
                {formatRateValue(estimate.contributionProfitPerMile)}/mi
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <LoadScoreBreakdown score={estimate.score} showBasis="loaded" />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">{copy.ranLoad}</p>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              {copy.carryNumbers}
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
                {copy.saveLoad}
                <ArrowRight className="size-3.5" />
              </Button>
            }
          />
        </CardContent>
      </Card>

      <p className="px-1 text-2xs leading-relaxed text-muted-foreground">
        {copy.estimateDisclaimer}
      </p>
    </>
  );
}

/* ---- Target rate ------------------------------------------------------ */

const TIER_TONE: Record<string, string> = {
  operatingBreakeven: "border-border bg-surface-sunken",
  cashBreakeven: "border-border bg-card",
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
  const { dictionary } = useLanguage();
  const copy = dictionary.calculator;
  const tierCopy = {
    operatingBreakeven: [copy.operatingBreakeven, copy.operatingBreakevenDescription],
    cashBreakeven: [copy.cashBreakeven, copy.cashBreakevenDescription],
    minimum: [copy.minimum, copy.minimumDescription],
    good: [copy.good, copy.goodDescription],
    great: [copy.great, copy.greatDescription],
    target: [copy.target, copy.targetDescription],
  } as const;
  if (target.impossible) {
    return (
      <Card className="border-neg/40">
        <CardContent className="p-6">
          <p className="text-sm text-neg">
            {copy.impossible}
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
            {copy.enterTarget}
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
          <CardTitle>{copy.whatToQuote}</CardTitle>
          <span className="text-2xs text-muted-foreground tnum">
            {interpolate(copy.totalMiles, { miles: formatMiles(target.totalMiles) })}
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
                <p className="text-xs font-semibold uppercase tracking-wide">{tierCopy[tier.key][0]}</p>
                <p className="mt-0.5 text-2xs opacity-80">{tierCopy[tier.key][1]}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="tnum text-xl font-semibold leading-none tracking-tight">
                  {formatMoneyCompact(tier.rate)}
                </p>
                <p className="mt-1 text-2xs opacity-70 tnum">
                  {interpolate(copy.perLoadedMile, {
                    rate: formatRateValue(tier.ratePerLoadedMile),
                  })}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{copy.workedOut}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4">
          <dl className="divide-y divide-border/70">
            <Line
              label={copy.fuel}
              hint={interpolate(copy.fuelHint, {
                gallons: target.gallons.toFixed(1),
                price: `$${toNumber(values.fuelPrice).toFixed(2)}`,
              })}
              value={formatMoney(target.fuelCost)}
            />
            <Line label={copy.tolls} value={formatMoney(target.tolls)} />
            <Line label={copy.otherCost} value={formatMoney(target.otherCost)} />
            <Line
              label={copy.allocatedCosts}
              hint={interpolate(copy.allocatedCostHint, {
                miles: formatMiles(target.totalMiles),
              })}
              value={formatMoney(target.overhead)}
            />
            <Line
              label={copy.debtCashOnly}
              hint={copy.debtExcluded}
              value={formatMoney(target.debtService)}
            />
            {target.flatFees > 0 ? (
              <Line label={copy.flatFees} value={formatMoney(target.flatFees)} />
            ) : null}
            <Line
              label={copy.fixedTripCosts}
              value={formatMoney(target.fixedTripCost)}
              strong
            />
          </dl>

          <div className="rounded-md border border-border bg-surface-sunken/60 p-3">
            <p className="text-2xs leading-relaxed text-muted-foreground">
              {interpolate(copy.feeExplanation, { percent: feePct })}
            </p>
            <p className="mt-2 rounded bg-card px-2.5 py-2 font-mono text-2xs text-foreground">
              {interpolate(copy.rateFormula, { rate: target.grossFeeRate.toFixed(3) })}
            </p>
            <p className="mt-2 text-2xs text-muted-foreground tnum">
              {interpolate(copy.costsBeforeProfit, {
                amount: formatMoney(target.fixedTripCost),
                rate: formatRateValue(target.costPerMile),
              })}
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
  const { dictionary } = useLanguage();
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
          aria-label={interpolate(dictionary.calculator.feeUnit, { label })}
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
