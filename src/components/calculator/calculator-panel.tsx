"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Calculator, RotateCcw, Target } from "lucide-react";
import { toast } from "sonner";

import {
  updateTruckFinancingConfirmationAction,
  updateTruckOperatingCostExemptionsAction,
} from "@/lib/actions/trucks";
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
  compareOfferToThresholds,
  suggestedOpeningQuote,
  type FeeMode,
} from "@/lib/finance/load-calculator";
import {
  formatMiles,
  formatMoney,
  formatMoneyCompact,
  formatPercent,
  formatRateValue,
} from "@/lib/formatters";
import type { OperatingCostGroup, Truck } from "@/lib/types";
import type { OperatingCostCoverageItem } from "@/lib/finance/cost-coverage";
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
  sharedOverheadUnallocated: boolean;
  sharedOverheadPerMile: number;
  costCoverage: OperatingCostCoverageItem[];
  costCoverageComplete: boolean;
  debtServiceRecorded: boolean;
  noFinancingConfirmed: boolean;
  canManageFinancing: boolean;
  canManageCostProfile: boolean;
  targetProfitPerMile: number;
  deadheadWarnPct: number;
  thresholds: RatingThresholds;
  brokers: string[];
  trucks: Truck[];
  defaultTruckId: string;
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

type RateContext = "OFFER" | "NO_OFFER";

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
  const router = useRouter();
  const { dictionary } = useLanguage();
  const copy = dictionary.calculator;
  const [values, setValues] = React.useState<Values>(() => initialValues(defaults));
  const [rateContext, setRateContext] = React.useState<RateContext>("OFFER");
  const [activeTab, setActiveTab] = React.useState("evaluate");
  const [noFinancingConfirmed, setNoFinancingConfirmed] = React.useState(
    defaults.noFinancingConfirmed,
  );
  const [savedNoFinancingConfirmed, setSavedNoFinancingConfirmed] = React.useState(
    defaults.noFinancingConfirmed,
  );
  const [financingUpdatePending, startFinancingUpdate] = React.useTransition();
  const [costCoverage, setCostCoverage] = React.useState(defaults.costCoverage);
  const [costProfileUpdatePending, startCostProfileUpdate] = React.useTransition();
  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const selectRateContext = (context: RateContext) => {
    setRateContext(context);
    setActiveTab(context === "OFFER" ? "evaluate" : "target");
  };

  const reset = () => {
    setValues(initialValues(defaults));
    setRateContext("OFFER");
    setActiveTab("evaluate");
    setNoFinancingConfirmed(savedNoFinancingConfirmed);
  };

  const updateNoFinancingConfirmation = (confirmedNone: boolean) => {
    const previous = noFinancingConfirmed;
    setNoFinancingConfirmed(confirmedNone);
    startFinancingUpdate(async () => {
      const result = await updateTruckFinancingConfirmationAction({
        truckId: defaults.defaultTruckId,
        confirmedNone,
      });
      if (result.ok) {
        setSavedNoFinancingConfirmed(confirmedNone);
        toast.success(copy.financingStatusSaved);
        return;
      }
      setNoFinancingConfirmed(previous);
      toast.error(copy.financingStatusSaveError);
    });
  };

  const cashBasisAvailable = defaults.basisSufficient
    && (defaults.debtServiceRecorded || noFinancingConfirmed);
  const operatingBasisValue = defaults.sharedOverheadUnallocated
    ? copy.sharedOverheadUnavailable
    : !defaults.costCoverageComplete
      ? copy.costProfileUnavailable
      : copy.notEnoughData;

  const updateCostExemption = (group: OperatingCostGroup, notApplicable: boolean) => {
    const previous = costCoverage;
    const next = costCoverage.map((item) =>
      item.group === group
        ? { ...item, status: notApplicable ? "NOT_APPLICABLE" as const : "UNKNOWN" as const }
        : item,
    );
    setCostCoverage(next);
    startCostProfileUpdate(async () => {
      const exemptions = Object.fromEntries(
        next
          .filter((item) => item.status === "NOT_APPLICABLE")
          .map((item) => [item.group, true]),
      );
      const result = await updateTruckOperatingCostExemptionsAction({
        truckId: defaults.defaultTruckId,
        exemptions,
      });
      if (result.ok) {
        toast.success(copy.costProfileSaved);
        router.refresh();
        return;
      }
      setCostCoverage(previous);
      toast.error(copy.costProfileSaveError);
    });
  };

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
    debtServicePerMile: noFinancingConfirmed ? 0 : defaults.debtServicePerMile,
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
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        setActiveTab(value);
        if (value === "evaluate") setRateContext("OFFER");
      }}
      className="space-y-3"
    >
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
              onClick={reset}
            >
              <RotateCcw className="size-3.5" />
              {copy.reset}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">{copy.rateContext}</p>
              <div
                role="group"
                aria-label={copy.rateContext}
                className="grid grid-cols-1 gap-1 rounded-md border border-border bg-surface-sunken p-1 sm:grid-cols-2"
              >
                <button
                  type="button"
                  aria-pressed={rateContext === "OFFER"}
                  onClick={() => selectRateContext("OFFER")}
                  className={cn(
                    "rounded px-3 py-2 text-left text-xs font-medium transition-colors",
                    rateContext === "OFFER"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {copy.haveBrokerOffer}
                </button>
                <button
                  type="button"
                  aria-pressed={rateContext === "NO_OFFER"}
                  onClick={() => selectRateContext("NO_OFFER")}
                  className={cn(
                    "rounded px-3 py-2 text-left text-xs font-medium transition-colors",
                    rateContext === "NO_OFFER"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {copy.noOfferCallForRate}
                </button>
              </div>
            </div>

            {rateContext === "OFFER" ? (
              <Field label={copy.grossOffered} htmlFor="calc-gross">
                <Input
                  id="calc-gross"
                  inputMode="decimal"
                  placeholder="700"
                  value={values.grossRate}
                  onChange={(e) => set("grossRate", e.target.value)}
                />
              </Field>
            ) : (
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
            )}

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
                      : operatingBasisValue
                  }
                />
                <BasisRow
                  label={copy.allocatedCost}
                  value={
                    defaults.basisSufficient
                      ? formatRateValue(defaults.overheadPerMile)
                      : operatingBasisValue
                  }
                />
                <BasisRow
                  label={copy.debtPerMile}
                  value={
                    noFinancingConfirmed
                      ? copy.confirmedNoFinancing
                      : defaults.debtServiceRecorded
                      ? formatRateValue(defaults.debtServicePerMile)
                      : copy.notEnoughData
                  }
                />
              </dl>
              {!defaults.debtServiceRecorded && defaults.canManageFinancing ? (
                <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-md border border-border bg-card p-2.5">
                  <input
                    type="checkbox"
                    checked={noFinancingConfirmed}
                    onChange={(event) => updateNoFinancingConfirmation(event.target.checked)}
                    disabled={financingUpdatePending}
                    aria-busy={financingUpdatePending}
                    aria-describedby="calc-no-financing-hint"
                    className="mt-0.5 size-4 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-foreground">
                      {copy.noFinancingConfirmation}
                    </span>
                    <span id="calc-no-financing-hint" className="mt-0.5 block text-2xs leading-relaxed text-muted-foreground">
                      {copy.noFinancingConfirmationHint}
                    </span>
                  </span>
                </label>
              ) : null}
              <CostCoverageChecklist
                items={costCoverage}
                canManage={defaults.canManageCostProfile}
                pending={costProfileUpdatePending}
                onExemptionChange={updateCostExemption}
              />
              <p className="mt-2 text-2xs leading-relaxed text-muted-foreground">
                {defaults.sharedOverheadUnallocated ? (
                  <span className="text-warn" data-testid="shared-overhead-warning">
                    {copy.sharedOverheadBasisWarning}
                  </span>
                ) : defaults.basisSufficient ? (
                  <>
                    {interpolate(copy.sufficientBasis, {
                      basis: defaults.basisLabel.toLowerCase(),
                      miles: formatMiles(defaults.basisMiles),
                    })}
                    {defaults.sharedOverheadPerMile > 0 ? (
                      <span data-testid="shared-overhead-allocation"> {interpolate(copy.sharedOverheadAllocatedBasis, {
                        rate: formatRateValue(defaults.sharedOverheadPerMile),
                      })}</span>
                    ) : null}
                  </>
                ) : (
                  <>
                    {!defaults.costCoverageComplete
                      ? <span data-testid="cost-profile-warning">{copy.costProfileBasisWarning}</span>
                      : copy.insufficientBasis}
                    {defaults.sharedOverheadPerMile > 0 ? (
                      <span data-testid="shared-overhead-allocation"> {interpolate(copy.sharedOverheadAllocatedBasis, {
                        rate: formatRateValue(defaults.sharedOverheadPerMile),
                      })}</span>
                    ) : null}
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
              debtServiceAvailable={cashBasisAvailable}
              noFinancingConfirmed={noFinancingConfirmed}
            />
          </TabsContent>
          <TabsContent value="target" className="m-0 space-y-3">
            <TargetResult
              target={target}
              values={values}
              defaults={defaults}
              rateContext={rateContext}
              debtServiceAvailable={cashBasisAvailable}
              noFinancingConfirmed={noFinancingConfirmed}
            />
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
  debtServiceAvailable,
  noFinancingConfirmed,
}: {
  estimate: ReturnType<typeof calculateLoadEstimate>;
  defaults: CalculatorDefaults;
  values: Values;
  debtServiceAvailable: boolean;
  noFinancingConfirmed: boolean;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.calculator;
  const operatingUnavailableDescription = defaults.sharedOverheadUnallocated
    ? copy.sharedOverheadUnavailableDescription
    : !defaults.costCoverageComplete
      ? copy.costProfileUnavailableDescription
      : copy.operatingUnavailableDescription;
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
          ? interpolate(copy.percentGross, { percent: values.dispatchValue })
          : copy.flatFee
        : line.key === "factoring"
          ? values.factoringMode === "PCT"
            ? interpolate(copy.percentGross, { percent: values.factoringValue })
            : copy.flatFee
          : undefined;
    return { label, hint };
  };
  const hasBrokerOffer = values.grossRate.trim().length > 0 && toNumber(values.grossRate) > 0;
  if (!hasBrokerOffer) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {copy.enterBrokerOffer}
          </p>
        </CardContent>
      </Card>
    );
  }
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
            {defaults.basisSufficient ? (
              <>
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
              </>
            ) : (
                <Line
                  label={copy.estimatedProfit}
                  hint={operatingUnavailableDescription}
                value={copy.unavailable}
              />
            )}
            {defaults.basisSufficient && debtServiceAvailable ? (
              <>
                <Line
                  label={copy.debtFinancing}
                  hint={noFinancingConfirmed ? copy.noFinancingConfirmedHint : copy.debtHint}
                  value={`-${formatMoney(estimate.debtService)}`}
                  tone="neg"
                />
                <Line
                  label={copy.cashAfterDebt}
                  value={formatMoney(estimate.cashAfterDebtService)}
                  tone={estimate.cashAfterDebtService >= 0 ? undefined : "neg"}
                  strong
                />
              </>
            ) : (
              <Line
                label={copy.cashAfterDebt}
                hint={defaults.sharedOverheadUnallocated
                  ? copy.sharedOverheadUnavailableDescription
                  : !defaults.costCoverageComplete
                    ? copy.costProfileUnavailableDescription
                  : noFinancingConfirmed
                    ? copy.cashRequiresOperatingBasis
                    : defaults.debtServiceRecorded
                      ? copy.cashRequiresOperatingHistory
                      : copy.cashUnavailableDescription}
                value={copy.unavailable}
              />
            )}
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

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {interpolate(copy.loadClassificationAnnouncement, {
          rating: estimateRating,
          score: String(estimate.score.score),
        })}
      </p>
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
            defaultTruckId={defaults.defaultTruckId}
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
  directBreakeven: "border-border bg-surface-sunken",
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
  defaults,
  rateContext,
  debtServiceAvailable,
  noFinancingConfirmed,
}: {
  target: ReturnType<typeof calculateTargetRate>;
  values: Values;
  defaults: CalculatorDefaults;
  rateContext: RateContext;
  debtServiceAvailable: boolean;
  noFinancingConfirmed: boolean;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.calculator;
  const operatingUnavailableDescription = defaults.sharedOverheadUnallocated
    ? copy.sharedOverheadUnavailableDescription
    : !defaults.costCoverageComplete
      ? copy.costProfileUnavailableDescription
      : copy.operatingUnavailableDescription;
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

  if (
    rateContext === "OFFER"
    && (values.grossRate.trim().length === 0 || toNumber(values.grossRate) <= 0)
  ) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center">
          <p className="text-sm text-muted-foreground">{copy.enterBrokerOffer}</p>
        </CardContent>
      </Card>
    );
  }

  const feePct = (target.grossFeeRate * 100).toFixed(1);
  const tier = (key: "operatingBreakeven" | "cashBreakeven" | "minimum" | "good" | "great" | "target") =>
    target.tiers.find((item) => item.key === key)!;
  const minimum = tier("minimum");
  const good = tier("good");
  const great = tier("great");
  const operating = tier("operatingBreakeven");
  const cash = tier("cashBreakeven");
  const customTarget = tier("target");
  const currentOffer = toNumber(values.grossRate);
  const hasCurrentOffer = rateContext === "OFFER";
  const comparison = hasCurrentOffer
    ? compareOfferToThresholds(currentOffer, {
        minimum: minimum.rate,
        good: good.rate,
        great: great.rate,
      })
    : null;
  const openingTarget = Math.max(
    great.rate,
    defaults.basisSufficient ? customTarget.rate : 0,
  );
  const openingQuote = suggestedOpeningQuote(openingTarget);

  const offerAction = comparison
    ? comparison.position === "GREAT"
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
            })
    : "";
  const offerRating = comparison
    ? comparison.position === "BELOW_MINIMUM"
      ? copy.badLoad
      : comparison.position === "MARGINAL"
        ? copy.marginalLoad
        : comparison.position === "GOOD"
          ? copy.goodLoad
          : copy.greatLoad
    : "";
  const offerAnnouncement = comparison
    ? comparison.suggestedCounteroffer === null
      ? interpolate(copy.offerAnnouncementNoCounter, { rating: offerRating })
      : interpolate(copy.offerAnnouncementWithCounter, {
          rating: offerRating,
          counter: formatMoneyCompact(comparison.suggestedCounteroffer),
        })
    : "";

  return (
    <>
      {comparison ? (
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
            <div className="rounded-md border border-primary/40 bg-primary/10 p-4">
              <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                {copy.currentBrokerOffer}
              </p>
              <p className="mt-1 tnum text-3xl font-semibold tracking-tight">
                {formatMoneyCompact(currentOffer)}
              </p>
            </div>
            <RateRow label={copy.minimumThreshold} description={copy.minimumDescription} rate={minimum.rate} ratePerLoadedMile={minimum.ratePerLoadedMile} tone="minimum" copy={copy} />
            <RateRow label={copy.goodThreshold} description={copy.goodDescription} rate={good.rate} ratePerLoadedMile={good.ratePerLoadedMile} tone="good" copy={copy} />
            <RateRow label={copy.greatThreshold} description={copy.greatDescription} rate={great.rate} ratePerLoadedMile={great.ratePerLoadedMile} tone="great" copy={copy} />

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
              comparison.position === "GREAT"
                ? "border-pos/40 bg-pos-soft"
                : comparison.position === "GOOD"
                  ? "border-info/40 bg-info-soft"
                  : "border-warn/40 bg-warn-soft",
            )}>
              <p className="text-sm font-semibold uppercase tracking-wide">{offerRating}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{offerAction}</p>
              {comparison.suggestedCounteroffer !== null ? (
                <div className="mt-3 flex items-end justify-between gap-4 border-t border-current/10 pt-3">
                  <div>
                    <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {copy.suggestedCounteroffer}
                    </p>
                    <p className="mt-1 text-2xs text-muted-foreground">{copy.counterStrategy}</p>
                  </div>
                  <p className="tnum text-2xl font-semibold tracking-tight text-primary">
                    {formatMoneyCompact(comparison.suggestedCounteroffer)}
                  </p>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{copy.whatToQuote}</CardTitle>
            <span className="text-2xs text-muted-foreground tnum">
              {interpolate(copy.totalMiles, { miles: formatMiles(target.totalMiles) })}
            </span>
          </CardHeader>
          <CardContent className="space-y-2 p-4">
            <RateRow label={copy.directCostBreakeven} description={copy.directCostBreakevenDescription} rate={target.directCostBreakEven} ratePerLoadedMile={target.directCostBreakEven / Math.max(1, toNumber(values.loadedMiles))} tone="directBreakeven" copy={copy} />
            <RateRow
              label={copy.trueOperatingBreakeven}
              description={defaults.basisSufficient ? copy.operatingBreakevenDescription : operatingUnavailableDescription}
              rate={defaults.basisSufficient ? operating.rate : null}
              ratePerLoadedMile={defaults.basisSufficient ? operating.ratePerLoadedMile : null}
              tone="operatingBreakeven"
              copy={copy}
            />
            <RateRow
              label={copy.cashBreakeven}
              description={defaults.sharedOverheadUnallocated
                ? copy.sharedOverheadUnavailableDescription
                : !defaults.costCoverageComplete
                  ? copy.costProfileUnavailableDescription
                : debtServiceAvailable
                ? noFinancingConfirmed
                  ? copy.cashBreakevenNoFinancingDescription
                  : copy.cashBreakevenDescription
                : noFinancingConfirmed
                  ? copy.cashRequiresOperatingBasis
                  : defaults.debtServiceRecorded
                    ? copy.cashRequiresOperatingHistory
                    : copy.cashUnavailableDescription}
              rate={debtServiceAvailable ? cash.rate : null}
              ratePerLoadedMile={debtServiceAvailable ? cash.ratePerLoadedMile : null}
              tone="cashBreakeven"
              copy={copy}
            />
            <RateRow label={copy.minimumThreshold} description={copy.minimumDescription} rate={minimum.rate} ratePerLoadedMile={minimum.ratePerLoadedMile} tone="minimum" copy={copy} />
            <RateRow label={copy.goodThreshold} description={copy.goodDescription} rate={good.rate} ratePerLoadedMile={good.ratePerLoadedMile} tone="good" copy={copy} />
            <RateRow label={copy.greatThreshold} description={copy.greatDescription} rate={great.rate} ratePerLoadedMile={great.ratePerLoadedMile} tone="great" copy={copy} />
            {defaults.basisSufficient ? (
              <RateRow label={copy.customOperatingTarget} description={copy.targetDescription} rate={customTarget.rate} ratePerLoadedMile={customTarget.ratePerLoadedMile} tone="target" copy={copy} />
            ) : null}

            <div className="mt-3 flex items-end justify-between gap-4 rounded-md border border-primary/50 bg-primary/10 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide">{copy.suggestedOpeningQuote}</p>
                <p className="mt-1 text-2xs text-muted-foreground">{copy.counterStrategy}</p>
              </div>
              <p className="tnum text-3xl font-semibold tracking-tight text-primary">
                {formatMoneyCompact(openingQuote)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

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
              hint={defaults.basisSufficient
                ? interpolate(copy.allocatedCostHint, { miles: formatMiles(target.totalMiles) })
                : operatingUnavailableDescription}
              value={defaults.basisSufficient ? formatMoney(target.overhead) : copy.unavailable}
            />
            <Line
              label={copy.debtCashOnly}
              hint={defaults.sharedOverheadUnallocated
                ? copy.sharedOverheadUnavailableDescription
                : !defaults.costCoverageComplete
                  ? copy.costProfileUnavailableDescription
                : debtServiceAvailable
                ? noFinancingConfirmed
                  ? copy.noFinancingConfirmedHint
                  : copy.debtExcluded
                : noFinancingConfirmed
                  ? copy.cashRequiresOperatingBasis
                  : defaults.debtServiceRecorded
                    ? copy.cashRequiresOperatingHistory
                    : copy.cashUnavailableDescription}
              value={debtServiceAvailable ? formatMoney(target.debtService) : copy.unavailable}
            />
            {target.flatFees > 0 ? (
              <Line label={copy.flatFees} value={formatMoney(target.flatFees)} />
            ) : null}
            <Line
              label={copy.fixedTripCosts}
              value={formatMoney(
                defaults.basisSufficient ? target.fixedTripCost : target.directFixedCost,
              )}
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
                amount: formatMoney(
                  defaults.basisSufficient ? target.fixedTripCost : target.directFixedCost,
                ),
                rate: formatRateValue(
                  defaults.basisSufficient
                    ? target.costPerMile
                    : target.directFixedCost / target.totalMiles,
                ),
              })}
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function RateRow({
  label,
  description,
  rate,
  ratePerLoadedMile,
  tone,
  copy,
}: {
  label: string;
  description: string;
  rate: number | null;
  ratePerLoadedMile: number | null;
  tone: string;
  copy: ReturnType<typeof useLanguage>["dictionary"]["calculator"];
}) {
  return (
    <div className={cn(
      "flex items-center justify-between gap-4 rounded-md border px-3.5 py-3",
      TIER_TONE[tone],
    )}>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
        <p className="mt-0.5 text-2xs opacity-80">{description}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="tnum text-xl font-semibold leading-none tracking-tight">
          {rate === null ? copy.unavailable : formatMoneyCompact(rate)}
        </p>
        {ratePerLoadedMile !== null ? (
          <p className="mt-1 text-2xs opacity-70 tnum">
            {interpolate(copy.perLoadedMile, { rate: formatRateValue(ratePerLoadedMile) })}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ---- Small pieces ------------------------------------------------------ */

function CostCoverageChecklist({
  items,
  canManage,
  pending,
  onExemptionChange,
}: {
  items: OperatingCostCoverageItem[];
  canManage: boolean;
  pending: boolean;
  onExemptionChange: (group: OperatingCostGroup, notApplicable: boolean) => void;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.calculator;
  const labelFor = (group: OperatingCostGroup) => {
    switch (group) {
      case "INSURANCE": return copy.costGroupInsurance;
      case "MAINTENANCE_REPAIRS": return copy.costGroupMaintenance;
      case "PERMITS_REGISTRATION": return copy.costGroupPermits;
      case "RECURRING_SERVICES": return copy.costGroupRecurring;
    }
  };

  return (
    <div className="mt-3 rounded-md border border-border bg-card p-2.5">
      <p className="text-xs font-medium text-foreground">{copy.costProfileTitle}</p>
      <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">
        {copy.costProfileDescription}
      </p>
      <ul className="mt-2 space-y-2" aria-label={copy.costProfileTitle}>
        {items.map((item) => {
          const label = labelFor(item.group);
          const recorded = item.status === "RECORDED";
          const notApplicable = item.status === "NOT_APPLICABLE";
          return (
            <li key={item.group} className="rounded border border-border/70 bg-surface-sunken px-2 py-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-2xs font-medium text-foreground">{label}</span>
                <span className={cn(
                  "text-2xs font-medium",
                  recorded ? "text-pos" : notApplicable ? "text-muted-foreground" : "text-warn",
                )}>
                  {recorded
                    ? copy.costRecorded
                    : notApplicable
                      ? copy.costNotApplicable
                      : copy.costUnknown}
                </span>
              </div>
              {!recorded && canManage ? (
                <label className="mt-1.5 flex cursor-pointer items-start gap-2 text-2xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={notApplicable}
                    onChange={(event) => onExemptionChange(item.group, event.target.checked)}
                    disabled={pending}
                    aria-busy={pending}
                    aria-label={`${label}: ${copy.costDoesNotApply}`}
                    className="mt-px size-3.5 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                  <span>{copy.costDoesNotApply}</span>
                </label>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="sr-only" aria-live="polite">
        {pending ? copy.costProfileSaving : ""}
      </p>
    </div>
  );
}

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
