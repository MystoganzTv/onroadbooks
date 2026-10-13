"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, RotateCcw } from "lucide-react";
import { LoadScoreBreakdown } from "@/components/cockpit/load-score-badge";
import { LoadFormDialog } from "@/components/loads/load-form-dialog";
import { Field } from "@/components/shared/field";
import { useLanguage } from "@/components/shell/language-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { RatingThresholds } from "@/lib/calculations";
import {
  calculateLoadEstimate,
  calculateTargetRate,
  compareOfferToThresholds,
  realRpmForDisplay,
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
import type { CalculatorBusinessExpenses } from "@/lib/finance/calculator-business-expenses";
import { categoryLabel } from "@/lib/categories";
import { formatLocaleDate } from "@/lib/i18n-format";
import { interpolate } from "@/lib/i18n/dictionaries";
import { cn, toNumber } from "@/lib/utils";

export interface CalculatorDefaults {
  fuelPrice: number;
  mpg: number;
  dispatchPct: number;
  factoringPct: number;
  businessExpenses: CalculatorBusinessExpenses;
  deadheadWarnPct: number;
  thresholds: RatingThresholds;
  /** Owner's operational floor, gross per TOTAL mile. */
  minRatePerTotalMile: number;
  /** Maintenance allocation per TOTAL mile. */
  maintenancePerMile: number;
  brokers: string[];
  dispatcherNames?: string[];
  trucks: Truck[];
  defaultTruckId: string;
  defaultDate: string;
}

interface Values {
  grossRate: string;
  loadedMiles: string;
  deadheadMiles: string;
  deadheadAfterMiles: string;
  fuelPrice: string;
  mpg: string;
  tolls: string;
  dispatchMode: FeeMode;
  dispatchValue: string;
  factoringMode: FeeMode;
  factoringValue: string;
  otherCost: string;
  minRatePerTotalMile: string;
  maintenancePerMile: string;
}

function initialValues(defaults: CalculatorDefaults): Values {
  return {
    grossRate: "",
    loadedMiles: "",
    deadheadMiles: "0",
    deadheadAfterMiles: "0",
    fuelPrice: defaults.fuelPrice ? defaults.fuelPrice.toFixed(2) : "3.85",
    mpg: defaults.mpg ? defaults.mpg.toFixed(1) : "",
    tolls: "",
    dispatchMode: "PCT",
    dispatchValue: defaults.dispatchPct ? String(defaults.dispatchPct) : "0",
    factoringMode: "PCT",
    factoringValue: defaults.factoringPct ? String(defaults.factoringPct) : "0",
    otherCost: "",
    minRatePerTotalMile: defaults.minRatePerTotalMile.toFixed(2),
    maintenancePerMile: defaults.maintenancePerMile.toFixed(2),
  };
}

/**
 * THE LOAD CALCULATOR.
 *
 * Used before saying yes to a broker, so everything recalculates as you type
 * and nothing is saved until you choose to save it. Monthly business expenses
 * are displayed as ledger context, never allocated to the proposed trip.
 *
 * All arithmetic comes from lib/finance/load-calculator. This component only
 * turns strings into numbers and numbers into layout.
 *
 * Placeholders are "0" on purpose: an example value such as "38" in grey
 * reads as an entered toll while the box is empty and calculates as $0.
 */
export function CalculatorPanel({ defaults }: { defaults: CalculatorDefaults }) {
  const { dictionary } = useLanguage();
  const copy = dictionary.calculator;
  const [values, setValues] = React.useState<Values>(() => initialValues(defaults));
  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const reset = () => {
    setValues(initialValues(defaults));
  };

  const shared = {
    loadedMiles: toNumber(values.loadedMiles),
    deadheadMiles: toNumber(values.deadheadMiles),
    deadheadAfterMiles: toNumber(values.deadheadAfterMiles),
    fuelPrice: toNumber(values.fuelPrice),
    mpg: toNumber(values.mpg),
    tolls: toNumber(values.tolls),
    dispatchMode: values.dispatchMode,
    dispatchValue: toNumber(values.dispatchValue),
    factoringMode: values.factoringMode,
    factoringValue: toNumber(values.factoringValue),
    otherCost: toNumber(values.otherCost),
    overheadPerMile: 0,
    debtServicePerMile: 0,
    minRatePerTotalMile: toNumber(values.minRatePerTotalMile),
  };

  const estimate = calculateLoadEstimate(
    {
      ...shared,
      grossRate: toNumber(values.grossRate),
      maintenancePerMile: toNumber(values.maintenancePerMile),
    },
    defaults.thresholds,
    defaults.deadheadWarnPct,
  );

  const target = calculateTargetRate(
    { ...shared, targetProfitPerMile: 0 },
    defaults.thresholds,
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-5">
        {/* ---- Inputs ------------------------------------------------- */}
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader>
            <CardTitle>{copy.theLoad}</CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={reset}
            >
              <RotateCcw className="size-3.5" />
              {copy.reset}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            <Field label={copy.grossOffered} htmlFor="calc-gross">
              <Input
                id="calc-gross"
                inputMode="decimal"
                placeholder="0"
                value={values.grossRate}
                onChange={(e) => set("grossRate", e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={copy.loadedMiles} htmlFor="calc-loaded" className="col-span-2">
                <Input
                  id="calc-loaded"
                  inputMode="numeric"
                  placeholder="0"
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
                  placeholder="0"
                  value={values.deadheadMiles}
                  onChange={(e) => set("deadheadMiles", e.target.value)}
                />
              </Field>
              <Field
                label={copy.deadheadAfterDelivery}
                htmlFor="calc-deadhead-after"
                hint={copy.alwaysCounted}
              >
                <Input
                  id="calc-deadhead-after"
                  inputMode="numeric"
                  placeholder="0"
                  value={values.deadheadAfterMiles}
                  onChange={(e) => set("deadheadAfterMiles", e.target.value)}
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
                  placeholder="0"
                  value={values.tolls}
                  onChange={(e) => set("tolls", e.target.value)}
                />
              </Field>
              <Field label={copy.otherCost} htmlFor="calc-other" hint={copy.otherCostHint}>
                <Input
                  id="calc-other"
                  inputMode="decimal"
                  placeholder="0"
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

            <div className="border-t border-border pt-3">
              <p className="mb-2 text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {copy.yourRules}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label={copy.minAllInRpm} htmlFor="calc-min-rpm" hint={copy.minAllInRpmHint}>
                  <Input
                    id="calc-min-rpm"
                    inputMode="decimal"
                    placeholder="0"
                    value={values.minRatePerTotalMile}
                    onChange={(e) => set("minRatePerTotalMile", e.target.value)}
                  />
                </Field>
                <Field
                  label={copy.maintenancePerMile}
                  htmlFor="calc-maintenance"
                  hint={copy.maintenancePerMileHint}
                >
                  <Input
                    id="calc-maintenance"
                    inputMode="decimal"
                    placeholder="0"
                    value={values.maintenancePerMile}
                    onChange={(e) => set("maintenancePerMile", e.target.value)}
                  />
                </Field>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ---- Results ------------------------------------------------ */}
        <div className="min-w-0 space-y-3 xl:col-span-3">
          <EvaluateResult estimate={estimate} target={target} defaults={defaults} values={values} />
        </div>
      </div>
    </div>
  );
}

/* ---- Evaluate --------------------------------------------------------- */

type Estimate = ReturnType<typeof calculateLoadEstimate>;
type Target = ReturnType<typeof calculateTargetRate>;
type CalculatorCopy = ReturnType<typeof useLanguage>["dictionary"]["calculator"];

function EvaluateResult({
  estimate,
  target,
  defaults,
  values,
}: {
  estimate: Estimate;
  target: Target;
  defaults: CalculatorDefaults;
  values: Values;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.calculator;
  const estimateRating = estimate.score.rating === "GREAT"
    ? copy.greatLoad
    : estimate.score.rating === "GOOD"
      ? copy.goodLoad
      : estimate.score.rating === "MARGINAL"
        ? copy.marginalLoad
        : copy.badLoad;
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
          ? interpolate(copy.percentGross, { percent: values.dispatchValue || "0" })
          : copy.flatFee
        : line.key === "factoring"
          ? values.factoringMode === "PCT"
            ? interpolate(copy.percentGross, { percent: values.factoringValue || "0" })
            : copy.flatFee
          : undefined;
    return { label, hint };
  };
  const hasBrokerOffer = values.grossRate.trim().length > 0 && toNumber(values.grossRate) > 0;
  if (!hasBrokerOffer) {
    return (
      <>
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {copy.enterBrokerOffer}
            </p>
          </CardContent>
        </Card>
        <BusinessExpensesCard expenses={defaults.businessExpenses} />
      </>
    );
  }
  if (!estimate.valid) {
    return (
      <>
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {copy.enterEvaluate}
            </p>
          </CardContent>
        </Card>
        <BusinessExpensesCard expenses={defaults.businessExpenses} />
      </>
    );
  }

  const gross = toNumber(values.grossRate);
  const floor = estimate.operationalMinimum;
  const realRpm = realRpmForDisplay(estimate.grossPerTotalMile, floor);
  const hasMaintenance = estimate.maintenancePerMile > 0;
  const perMileAndMargin = (perMile: number, margin: number) =>
    interpolate(copy.perMileMargin, {
      rate: formatRateValue(perMile),
      percent: formatPercent(margin),
    });

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{copy.evaluateTab}</CardTitle>
          <span className="text-2xs text-muted-foreground tnum">
            {interpolate(copy.totalDeadhead, {
              miles: formatMiles(estimate.totalMiles),
              percent: formatPercent(estimate.deadheadPct, 0),
            })}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {/* ---- Decision strip: offer, both RPMs, miles ----------------- */}
          <div className="space-y-3 border-b border-border p-4" data-testid="calculator-decision">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {copy.currentBrokerOffer}
                </p>
                <p className="mt-1 tnum text-3xl font-semibold leading-none tracking-tight">
                  {formatMoney(gross)}
                </p>
              </div>
              <FloorPill floor={floor} copy={copy} />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Metric
                label={copy.loadedRpm}
                value={interpolate(copy.perLoadedMile, {
                  rate: formatRateValue(estimate.grossPerLoadedMile),
                })}
                hint={copy.loadedRpmHint}
                testId="loaded-rpm"
              />
              <Metric
                label={copy.realRpm}
                value={interpolate(copy.perTotalMile, { rate: formatRateValue(realRpm) })}
                hint={copy.realRpmHint}
                tone={floor.meets === false ? "warn" : undefined}
                emphasis
                testId="real-rpm"
              />
              <Metric
                label={copy.totalMilesLabel}
                value={formatMiles(estimate.totalMiles)}
                hint={interpolate(copy.totalMilesBreakdown, {
                  loaded: formatMiles(estimate.loadedMiles),
                  deadhead: formatMiles(estimate.deadheadMiles),
                })}
                testId="total-miles"
                className="col-span-2 sm:col-span-1"
              />
            </div>
            {floor.meets === false ? (
              <p className="text-2xs text-warn tnum" data-testid="floor-gap">
                {interpolate(copy.needsForMinimum, {
                  rate: formatMoney(floor.rate),
                  rpm: formatRateValue(floor.ratePerTotalMile),
                  gap: formatMoney(floor.shortfall),
                })}
              </p>
            ) : null}
          </div>

          {/* ---- Gross -> direct costs -> contribution -> maintenance ---- */}
          <dl className="divide-y divide-border/70">
            <Line label={copy.grossRate} value={formatMoney(gross)} strong />
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
              label={copy.directTripCosts}
              value={`-${formatMoney(estimate.directTripCosts)}`}
              tone="neg"
              testId="direct-trip-costs"
            />
            <Line
              label={copy.tripMoneyLeft}
              hint={perMileAndMargin(estimate.contributionProfitPerMile, estimate.contributionMargin)}
              value={formatMoney(estimate.contributionProfit)}
              tone={estimate.contributionProfit >= 0 ? undefined : "neg"}
              strong
              testId="contribution-profit"
            />
            {hasMaintenance ? (
              <>
                <Line
                  label={copy.maintenanceAllocation}
                  hint={interpolate(copy.maintenanceAllocationHint, {
                    rate: formatRateValue(estimate.maintenancePerMile),
                    miles: formatMiles(estimate.totalMiles),
                  })}
                  value={`-${formatMoney(estimate.maintenanceAllocation)}`}
                  tone="neg"
                  testId="maintenance-allocation"
                />
                <Line
                  label={copy.afterMaintenance}
                  hint={perMileAndMargin(
                    estimate.contributionAfterMaintenancePerMile,
                    estimate.contributionAfterMaintenanceMargin,
                  )}
                  value={formatMoney(estimate.contributionAfterMaintenance)}
                  tone={estimate.contributionAfterMaintenance >= 0 ? undefined : "neg"}
                  strong
                  testId="after-maintenance"
                />
              </>
            ) : null}
          </dl>

          <div
            className={cn(
              "grid gap-4 border-t-2 px-4 py-4",
              hasMaintenance ? "grid-cols-2" : "grid-cols-1",
              estimate.contributionProfit >= 0
                ? "border-pos/40 bg-pos-soft/40"
                : "border-neg/40 bg-neg-soft/40",
            )}
          >
            <Headline
              label={copy.tripMoneyLeft}
              note={copy.tripMoneyLeftHint}
              amount={estimate.contributionProfit}
              perMile={estimate.contributionProfitPerMile}
            />
            {hasMaintenance ? (
              <Headline
                label={copy.afterMaintenance}
                note={copy.afterMaintenanceHint}
                amount={estimate.contributionAfterMaintenance}
                perMile={estimate.contributionAfterMaintenancePerMile}
              />
            ) : null}
          </div>
        </CardContent>
      </Card>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {interpolate(copy.loadClassificationAnnouncement, {
          rating: estimateRating,
          score: String(estimate.score.score),
        })}
      </p>
      <LoadScoreBreakdown score={estimate.score} showBasis="loaded" />

      <OfferComparison target={target} estimate={estimate} values={values} />

      <BusinessExpensesCard expenses={defaults.businessExpenses} />

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground">{copy.ranLoad}</p>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              {copy.carryNumbers}
            </p>
          </div>
          <LoadFormDialog
            dispatcherNames={defaults.dispatcherNames}
            brokers={defaults.brokers}
            trucks={defaults.trucks}
            defaultTruckId={defaults.defaultTruckId}
            defaultDate={defaults.defaultDate}
            ratingThresholds={defaults.thresholds}
            prefill={{
              loadedMiles: toNumber(values.loadedMiles),
              // A load stores one deadhead figure; both legs were priced here,
              // so both are carried, keeping the saved load's RPM the same.
              deadheadMiles: estimate.deadheadMiles,
              grossRate: gross,
              fuelCost: estimate.fuelCost,
              // Tolls and other costs stay planning numbers: posted from a quote
              // they would land in Expenses on top of the real toll bill.
              dispatchFee: estimate.dispatch,
              factoringFee: estimate.factoring,
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

function FloorPill({
  floor,
  copy,
}: {
  floor: Estimate["operationalMinimum"];
  copy: CalculatorCopy;
}) {
  const rpm = formatRateValue(floor.ratePerTotalMile);
  const [text, tone] = floor.meets === null
    ? [copy.noMinimumRpm, "border-border text-muted-foreground"]
    : floor.meets
      ? [interpolate(copy.meetsMinimumRpm, { rate: rpm }), "border-pos/40 bg-pos-soft text-pos"]
      : [interpolate(copy.belowMinimumRpm, { rate: rpm }), "border-warn/40 bg-warn-soft text-warn"];
  return (
    <span
      className={cn("rounded-full border px-2.5 py-1 text-2xs font-semibold tnum", tone)}
      data-testid="floor-status"
    >
      {text}
    </span>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
  emphasis,
  testId,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "warn";
  emphasis?: boolean;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-md border px-3 py-2.5",
        emphasis ? "border-primary/40 bg-primary/5" : "border-border",
        className,
      )}
    >
      <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 tnum font-semibold leading-tight",
          emphasis ? "text-lg" : "text-md",
          tone === "warn" ? "text-warn" : "text-foreground",
        )}
        data-testid={testId}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-2xs leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Headline({
  label,
  note,
  amount,
  perMile,
}: {
  label: string;
  note: string;
  amount: number;
  perMile: number;
}) {
  return (
    <div className="min-w-0">
      <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 tnum text-2xl font-semibold leading-none tracking-tight sm:text-3xl",
          amount >= 0 ? "text-pos" : "text-neg",
        )}
      >
        {formatMoneyCompact(amount)}
      </p>
      <p className={cn("mt-1 tnum text-sm font-medium", perMile >= 0 ? "text-pos" : "text-neg")}>
        {formatRateValue(perMile)}/mi
      </p>
      <p className="mt-1 text-2xs text-muted-foreground">{note}</p>
    </div>
  );
}

/* ---- Business context and offer comparison ---------------------------- */

const TIER_TONE: Record<string, string> = {
  operationalMinimum: "border-warn/40 bg-warn-soft",
  minimum: "border-border bg-card",
  good: "border-info/40 bg-info-soft",
  great: "border-pos/40 bg-pos-soft",
};

function BusinessExpensesCard({ expenses }: { expenses: CalculatorBusinessExpenses }) {
  const { dictionary, locale } = useLanguage();
  const copy = dictionary.calculator;
  return (
    <Card data-testid="calculator-business-expenses">
      <CardHeader>
        <CardTitle>{copy.monthlyBusinessExpenses}</CardTitle>
        <span className="text-2xs text-muted-foreground">
          {formatLocaleDate(`${expenses.month}-01`, locale, { month: "long", year: "numeric" })}
        </span>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">{copy.monthlyBusinessExpensesHelp}</p>
        {expenses.entries.length ? (
          <>
            <dl className="divide-y divide-border/70">
              {expenses.entries.map((expense) => (
                <div key={expense.id} className="flex items-start justify-between gap-4 py-2">
                  <dt className="min-w-0 break-words text-sm">
                    {expense.description}
                    <span className="mt-0.5 block text-2xs text-muted-foreground">
                      {categoryLabel(expense.category, locale)}
                      {expense.scope === "BUSINESS" ? ` · ${copy.sharedBusinessExpense}` : ""}
                    </span>
                  </dt>
                  <dd className="shrink-0 text-sm tnum">{formatMoney(expense.amount)}</dd>
                </div>
              ))}
            </dl>
            <div className="flex justify-between gap-4 border-t border-border pt-3 text-sm font-semibold">
              <span>{copy.monthlyRecordedTotal}</span>
              <span className="tnum" data-testid="monthly-business-total">{formatMoney(expenses.total)}</span>
            </div>
          </>
        ) : <p className="text-sm text-muted-foreground">{copy.noMonthlyBusinessExpenses}</p>}
        <Button asChild size="sm" variant="outline">
          <Link href={`/expenses?month=${expenses.month}&period=month`}>{copy.viewExpenses}<ArrowRight className="size-3.5" /></Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function OfferComparison({ target, estimate, values }: {
  target: Target;
  estimate: Estimate;
  values: Values;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.calculator;
  if (!target.valid || target.impossible || toNumber(values.grossRate) <= 0) return null;

  const tier = (key: "operationalMinimum" | "minimum" | "good" | "great") =>
    target.tiers.find((item) => item.key === key)!;
  const operational = tier("operationalMinimum");
  const hasFloor = operational.rate > 0;
  const minimum = tier("minimum");
  const good = tier("good");
  const great = tier("great");
  const currentOffer = toNumber(values.grossRate);
  const comparison = compareOfferToThresholds(currentOffer, {
    minimum: minimum.rate,
    good: good.rate,
    great: great.rate,
    operationalMinimum: hasFloor ? operational.rate : 0,
  });
  const belowFloor = comparison.meetsOperationalMinimum === false;
  const floorRpm = formatRateValue(operational.profitPerMile);

  const offerAction = belowFloor
    ? interpolate(copy.offerBelowOperationalAction, {
        gap: formatMoney(Math.max(0, operational.rate - currentOffer)),
        rpm: floorRpm,
        minimum: formatMoney(operational.rate),
        target: formatMoneyCompact(comparison.settlementTarget ?? operational.rate),
        walkAway: formatMoney(comparison.walkAway),
      })
    : comparison.position === "GREAT"
      ? copy.offerGreatAction
      : comparison.position === "GOOD"
        ? interpolate(copy.offerGoodAction, {
            target: formatMoneyCompact(comparison.settlementTarget ?? great.rate),
          })
        : comparison.position === "MARGINAL"
          ? interpolate(copy.offerMarginalAction, {
              target: formatMoneyCompact(comparison.settlementTarget ?? good.rate),
            })
          : interpolate(copy.offerBelowAction, {
              minimum: formatMoneyCompact(minimum.rate),
              target: formatMoneyCompact(comparison.settlementTarget ?? good.rate),
            });
  const offerRating = comparison.position === "BELOW_MINIMUM"
    ? copy.badLoad
    : comparison.position === "MARGINAL"
      ? copy.marginalLoad
      : comparison.position === "GOOD"
        ? copy.goodLoad
        : copy.greatLoad;
  const floorVerdict = hasFloor
    ? interpolate(belowFloor ? copy.belowMinimumRpm : copy.meetsMinimumRpm, { rate: floorRpm })
    : copy.noMinimumRpm;
  const offerAnnouncement = [
    comparison.suggestedCounteroffer === null
      ? interpolate(copy.offerAnnouncementNoCounter, { rating: offerRating })
      : interpolate(copy.offerAnnouncementWithCounter, {
          rating: offerRating,
          counter: formatMoneyCompact(comparison.suggestedCounteroffer),
        }),
    hasFloor ? `${floorVerdict}.` : "",
  ].filter(Boolean).join(" ");
  const descriptionFor = (template: string, perMile: number) =>
    interpolate(template, { rate: formatRateValue(perMile) });
  const realRpm = realRpmForDisplay(estimate.grossPerTotalMile, estimate.operationalMinimum);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.offerVsThresholds}</CardTitle>
        <span className="text-2xs text-muted-foreground tnum">
          {interpolate(copy.totalMiles, { miles: formatMiles(target.totalMiles) })}
        </span>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        <p
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-testid="offer-announcement"
        >
          {offerAnnouncement}
        </p>
        <div className="flex items-end justify-between gap-4 rounded-md border border-primary/40 bg-primary/10 p-4">
          <div>
            <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              {copy.currentBrokerOffer}
            </p>
            <p className="mt-1 tnum text-3xl font-semibold tracking-tight">
              {formatMoneyCompact(currentOffer)}
            </p>
          </div>
          <p className={cn("tnum text-sm font-semibold", belowFloor ? "text-warn" : "text-foreground")}>
            {interpolate(copy.perTotalMile, { rate: formatRateValue(realRpm) })}
          </p>
        </div>
        {hasFloor ? (
          <RateRow
            label={copy.operationalMinimumThreshold}
            description={interpolate(copy.operationalMinimumDescription, { rpm: floorRpm })}
            tier={operational}
            tone="operationalMinimum"
            copy={copy}
            testId="threshold-operational"
          />
        ) : null}
        <RateRow label={copy.minimumThreshold} description={descriptionFor(copy.minimumDescription, minimum.profitPerMile)} tier={minimum} tone="minimum" copy={copy} testId="threshold-profitability" />
        <RateRow label={copy.goodThreshold} description={descriptionFor(copy.goodDescription, good.profitPerMile)} tier={good} tone="good" copy={copy} testId="threshold-good" />
        <RateRow label={copy.greatThreshold} description={descriptionFor(copy.greatDescription, great.profitPerMile)} tier={great} tone="great" copy={copy} testId="threshold-great" />

        <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3.5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide">{copy.differenceVsGreat}</p>
          <p className={cn(
            "tnum text-lg font-semibold",
            comparison.differenceVsGreat >= 0 ? "text-pos" : "text-warn",
          )}>
            {comparison.differenceVsGreat >= 0 ? "+" : "−"}
            {formatMoneyCompact(Math.abs(comparison.differenceVsGreat))}
          </p>
        </div>

        <div className={cn(
          "rounded-md border p-4",
          belowFloor
            ? "border-warn/40 bg-warn-soft"
            : comparison.position === "GREAT"
              ? "border-pos/40 bg-pos-soft"
              : comparison.position === "GOOD"
                ? "border-info/40 bg-info-soft"
                : "border-warn/40 bg-warn-soft",
        )}>
          {/* Both verdicts, side by side: neither may hide the other. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                {copy.contributionBasis}
              </p>
              <p className="mt-0.5 text-sm font-semibold uppercase tracking-wide" data-testid="verdict-contribution">
                {offerRating}
              </p>
            </div>
            <div>
              <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                {copy.allInRpmRule}
              </p>
              <p
                className={cn(
                  "mt-0.5 text-sm font-semibold uppercase tracking-wide",
                  belowFloor ? "text-warn" : hasFloor ? "text-pos" : "text-muted-foreground",
                )}
                data-testid="verdict-floor"
              >
                {floorVerdict}
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{offerAction}</p>
          {comparison.suggestedCounteroffer !== null ? (
            <div className="mt-3 space-y-2 border-t border-current/10 pt-3">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {copy.suggestedCounteroffer}
                  </p>
                  <p className="mt-1 text-2xs text-muted-foreground">{copy.counterStrategy}</p>
                </div>
                <p className="tnum text-2xl font-semibold tracking-tight text-primary" data-testid="suggested-counteroffer">
                  {formatMoneyCompact(comparison.suggestedCounteroffer)}
                </p>
              </div>
              <div className="flex items-center justify-between gap-4 text-xs">
                <span className="text-muted-foreground">{copy.walkAway}</span>
                <span className="tnum font-semibold" data-testid="walk-away">
                  {formatMoney(comparison.walkAway)}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function RateRow({
  label,
  description,
  tier,
  tone,
  copy,
  testId,
}: {
  label: string;
  description: string;
  tier: Target["tiers"][number];
  tone: string;
  copy: CalculatorCopy;
  testId?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-md border px-3.5 py-3",
        TIER_TONE[tone],
      )}
      data-testid={testId}
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
        <p className="mt-0.5 text-2xs opacity-80">{description}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="tnum text-xl font-semibold leading-none tracking-tight">
          {formatMoney(tier.rate)}
        </p>
        <p className="mt-1 text-2xs font-medium tnum">
          {interpolate(copy.perTotalMile, { rate: formatRateValue(tier.ratePerTotalMile) })}
        </p>
        <p className="text-2xs opacity-70 tnum">
          {interpolate(copy.perLoadedMile, { rate: formatRateValue(tier.ratePerLoadedMile) })}
        </p>
      </div>
    </div>
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

function Line({
  label,
  hint,
  value,
  tone,
  strong,
  testId,
}: {
  label: string;
  hint?: string;
  value: string;
  tone?: "neg";
  strong?: boolean;
  testId?: string;
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
        data-testid={testId}
      >
        {value}
      </dd>
    </div>
  );
}
