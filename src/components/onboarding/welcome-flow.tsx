"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Check, Loader2, Target, TruckIcon } from "lucide-react";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";
import type { AppLocale } from "@/lib/i18n";
import { getWebDictionary, interpolate } from "@/lib/i18n/dictionaries";

import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { updateGoalsAction } from "@/lib/actions/goals";
import { updateSettingsAction, updateTruckAction } from "@/lib/actions/settings";
import { formatMoney } from "@/lib/formatters";
import { iftaApplicability, iftaApplicabilityLabel } from "@/lib/ifta-eligibility";
import type { Business, FinancialGoal, FinancialSettings, Truck } from "@/lib/types";
import { cn, toNumber, toRequiredNumber } from "@/lib/utils";

interface WelcomeFlowProps {
  business: Business;
  truck: Truck;
  settings: FinancialSettings;
  goals: FinancialGoal;
  planName: string;
  locale: AppLocale;
}

function initialBusinessName(name: string): string {
  if (name === "My Trucking Business" || /^.+['’]s Trucking Business$/.test(name)) return "";
  return name;
}

/**
 * What happens after the account exists.
 *
 * Business identity is confirmed once; the operational steps remain
 * skippable. Every step writes through the same server actions the Settings
 * and Truck pages use, so onboarding cannot drift into a second data model.
 */
export function WelcomeFlow({ business, truck, settings, goals, planName, locale }: WelcomeFlowProps) {
  const router = useRouter();
  const dictionary = getWebDictionary(locale);
  const copy = dictionary.onboarding;
  const settingsCopy = dictionary.settings;
  const truckCopy = dictionary.truck;
  const steps = [copy.businessStep, copy.truckStep, copy.runStep, copy.doneStep] as const;
  const [step, setStep] = React.useState(0);
  const [pending, startTransition] = React.useTransition();
  const [businessName, setBusinessName] = React.useState(initialBusinessName(business.name));

  const [truckValues, setTruckValues] = React.useState({
    name: truck.name,
    year: truck.year ? String(truck.year) : "",
    make: truck.make ?? "",
    model: truck.model ?? "",
    currentOdometer: String(truck.currentOdometer || ""),
    monthlyPayment: truck.monthlyPayment ? String(truck.monthlyPayment) : "",
    monthlyInsurance: truck.monthlyInsurance ? String(truck.monthlyInsurance) : "",
    axleCount: truck.axleCount ? String(truck.axleCount) : "",
    registeredGrossWeightLbs: truck.registeredGrossWeightLbs
      ? String(truck.registeredGrossWeightLbs)
      : "",
    operatesInMultipleIftaJurisdictions:
      truck.operatesInMultipleIftaJurisdictions == null
        ? "UNKNOWN"
        : truck.operatesInMultipleIftaJurisdictions
          ? "YES"
          : "NO",
    iftaReportingEnabled:
      truck.iftaReportingEnabled == null
        ? "UNDECIDED"
        : truck.iftaReportingEnabled
          ? "INCLUDED"
          : "EXCLUDED",
  });

  const [runValues, setRunValues] = React.useState({
    taxReservePct: String(settings.taxReservePct),
    maintenanceReservePct: String(settings.maintenanceReservePct),
    monthlyRevenueTarget: String(goals.monthlyRevenueTarget || ""),
    monthlyProfitTarget: String(goals.monthlyProfitTarget || ""),
    workingDaysPerWeek: String(goals.workingDaysPerWeek || 6),
  });

  const setTruckValue = (key: keyof typeof truckValues, value: string) =>
    setTruckValues((prev) => ({ ...prev, [key]: value }));
  const setRunValue = (key: keyof typeof runValues, value: string) =>
    setRunValues((prev) => ({ ...prev, [key]: value }));

  function saveBusiness() {
    if (!businessName.trim()) {
      toast.error(copy.businessRequired);
      return;
    }
    startTransition(async () => {
      const result = await updateSettingsAction({
        businessName: businessName.trim(),
        currency: business.currency,
        taxReservePct: settings.taxReservePct,
        maintenanceReservePct: settings.maintenanceReservePct,
        categoryBehavior: settings.categoryBehavior,
        ratingGreatPerMile: settings.ratingGreatPerMile,
        ratingGoodPerMile: settings.ratingGoodPerMile,
        ratingMarginalPerMile: settings.ratingMarginalPerMile,
        deadheadWarnPct: settings.deadheadWarnPct,
        maintenanceWarnMiles: settings.maintenanceWarnMiles,
        maintenanceWarnDays: settings.maintenanceWarnDays,
      });

      if (result.ok) setStep(1);
      else toast.error(localizedClientError(result.error));
    });
  }

  function saveTruck() {
    startTransition(async () => {
      const result = await updateTruckAction({
        name: truckValues.name.trim() || truck.name,
        year: toRequiredNumber(truckValues.year) ?? null,
        make: truckValues.make.trim() || null,
        model: truckValues.model.trim() || null,
        vin: truck.vin,
        purchasePrice: truck.purchasePrice,
        monthlyPayment: toRequiredNumber(truckValues.monthlyPayment) ?? null,
        monthlyInsurance: toRequiredNumber(truckValues.monthlyInsurance) ?? null,
        axleCount: toRequiredNumber(truckValues.axleCount) ?? null,
        registeredGrossWeightLbs:
          toRequiredNumber(truckValues.registeredGrossWeightLbs) ?? null,
        operatesInMultipleIftaJurisdictions:
          truckValues.operatesInMultipleIftaJurisdictions === "UNKNOWN"
            ? null
            : truckValues.operatesInMultipleIftaJurisdictions === "YES",
        iftaReportingEnabled:
          truckValues.iftaReportingEnabled === "UNDECIDED"
            ? null
            : truckValues.iftaReportingEnabled === "INCLUDED",
        startingOdometer: truck.startingOdometer,
        currentOdometer:
          toRequiredNumber(truckValues.currentOdometer) ?? truck.currentOdometer,
      });

      if (result.ok) setStep(2);
      else toast.error(localizedClientError(result.error));
    });
  }

  function saveHowYouRun() {
    startTransition(async () => {
      const settingsResult = await updateSettingsAction({
        businessName: businessName.trim(),
        currency: business.currency,
        taxReservePct: toNumber(runValues.taxReservePct, settings.taxReservePct),
        maintenanceReservePct: toNumber(
          runValues.maintenanceReservePct,
          settings.maintenanceReservePct,
        ),
        categoryBehavior: settings.categoryBehavior,
        ratingGreatPerMile: settings.ratingGreatPerMile,
        ratingGoodPerMile: settings.ratingGoodPerMile,
        ratingMarginalPerMile: settings.ratingMarginalPerMile,
        deadheadWarnPct: settings.deadheadWarnPct,
        maintenanceWarnMiles: settings.maintenanceWarnMiles,
        maintenanceWarnDays: settings.maintenanceWarnDays,
      });

      if (!settingsResult.ok) {
        toast.error(localizedClientError(settingsResult.error));
        return;
      }

      const goalsResult = await updateGoalsAction({
        monthlyRevenueTarget: toNumber(runValues.monthlyRevenueTarget, goals.monthlyRevenueTarget),
        monthlyProfitTarget: toNumber(runValues.monthlyProfitTarget, goals.monthlyProfitTarget),
        targetProfitPerMile: goals.targetProfitPerMile,
        maxDeadheadPct: goals.maxDeadheadPct,
        targetLoads: goals.targetLoads,
        workingDaysPerWeek: toNumber(runValues.workingDaysPerWeek, goals.workingDaysPerWeek),
        expectedMonthlyMiles: goals.expectedMonthlyMiles,
      });

      if (goalsResult.ok) setStep(3);
      else toast.error(localizedClientError(goalsResult.error));
    });
  }

  function finish() {
    router.replace("/dashboard");
  }

  const workingDays = toNumber(runValues.workingDaysPerWeek, 6);
  const dailyTarget = toNumber(runValues.monthlyProfitTarget) / Math.max(1, Math.round(workingDays * 4.345));
  const currentIftaStatus = iftaApplicability({
    axleCount: toRequiredNumber(truckValues.axleCount) ?? null,
    registeredGrossWeightLbs:
      toRequiredNumber(truckValues.registeredGrossWeightLbs) ?? null,
    operatesInMultipleIftaJurisdictions:
      truckValues.operatesInMultipleIftaJurisdictions === "UNKNOWN"
        ? null
        : truckValues.operatesInMultipleIftaJurisdictions === "YES",
  });

  return (
    <div className="mx-auto w-full max-w-2xl p-4 py-8 lg:py-12">
      <ol className="mb-6 flex items-center gap-2" aria-label={copy.progress}>
        {steps.map((label, index) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-2xs font-semibold",
                index < step
                  ? "bg-pos text-white"
                  : index === step
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground",
              )}
            >
              {index < step ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span
              className={cn(
                "truncate text-2xs",
                index === step ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {index < steps.length - 1 ? (
              <span className="h-px flex-1 bg-border" aria-hidden />
            ) : null}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" />
            <h1 className="text-md font-semibold tracking-tight">{copy.startBusiness}</h1>
          </div>
          <p className="mt-1 text-2xs text-muted-foreground">
            {copy.businessDescription}
          </p>

          <div className="mt-4">
            <Field
              label={settingsCopy.businessName}
              htmlFor="w-business-name"
              hint={copy.businessHint}
              required
            >
              <Input
                id="w-business-name"
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                placeholder="Padron Freight LLC"
                maxLength={120}
                autoComplete="organization"
                autoFocus
                required
              />
            </Field>
          </div>

          <div className="mt-5 flex justify-end">
            <Button type="button" onClick={saveBusiness} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {copy.continue}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <TruckIcon className="size-4 text-muted-foreground" />
            <h1 className="text-md font-semibold tracking-tight">{copy.truckTitle}</h1>
          </div>
          <p className="mt-1 text-2xs text-muted-foreground">
            {copy.truckDescription}
          </p>
          <p className="mt-2 rounded-md border border-info/25 bg-info-soft px-3 py-2 text-2xs leading-relaxed text-muted-foreground">
            {interpolate(copy.starterUnit, { truck: truck.name })}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label={copy.nameIt} htmlFor="w-name" hint={copy.nameHint}>
              <Input
                id="w-name"
                value={truckValues.name}
                onChange={(e) => setTruckValue("name", e.target.value)}
                placeholder="Unit 101"
                maxLength={80}
                autoFocus
              />
            </Field>
            <Field label={truckCopy.currentOdometer} htmlFor="w-odo">
              <Input
                id="w-odo"
                inputMode="numeric"
                value={truckValues.currentOdometer}
                onChange={(e) => setTruckValue("currentOdometer", e.target.value)}
              />
            </Field>
            <Field label={truckCopy.year} htmlFor="w-year">
              <Input
                id="w-year"
                inputMode="numeric"
                value={truckValues.year}
                onChange={(e) => setTruckValue("year", e.target.value)}
                placeholder="2021"
              />
            </Field>
            <Field label={copy.makeModel} htmlFor="w-make">
              <div className="flex gap-2">
                <Input
                  id="w-make"
                  value={truckValues.make}
                  onChange={(e) => setTruckValue("make", e.target.value)}
                  placeholder="Freightliner"
                />
                <Input
                  aria-label={copy.model}
                  value={truckValues.model}
                  onChange={(e) => setTruckValue("model", e.target.value)}
                  placeholder="M2 106"
                />
              </div>
            </Field>
            <Field label={truckCopy.powerAxles} htmlFor="w-axles" hint={copy.axleHint}>
              <Input
                id="w-axles"
                inputMode="numeric"
                value={truckValues.axleCount}
                onChange={(e) => setTruckValue("axleCount", e.target.value)}
                placeholder="2"
              />
            </Field>
            <Field
              label={truckCopy.registeredWeight}
              htmlFor="w-registered-weight"
              hint={copy.weightHint}
            >
              <Input
                id="w-registered-weight"
                inputMode="numeric"
                value={truckValues.registeredGrossWeightLbs}
                onChange={(e) => setTruckValue("registeredGrossWeightLbs", e.target.value)}
                placeholder="26000"
              />
            </Field>
            <Field
              label={truckCopy.operatingArea}
              htmlFor="w-ifta-jurisdictions"
              hint={truckCopy.operatingAreaHint}
              className="sm:col-span-2"
            >
              <Select
                value={truckValues.operatesInMultipleIftaJurisdictions}
                onValueChange={(value) =>
                  setTruckValue("operatesInMultipleIftaJurisdictions", value)
                }
              >
                <SelectTrigger id="w-ifta-jurisdictions"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UNKNOWN">{truckCopy.unsure}</SelectItem>
                  <SelectItem value="YES">{truckCopy.multipleJurisdictions}</SelectItem>
                  <SelectItem value="NO">{truckCopy.oneJurisdiction}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field
              label={truckCopy.quarterlyIfta}
              htmlFor="w-ifta-reporting"
              hint={copy.iftaDecisionHint}
              className="sm:col-span-2"
            >
              <Select
                value={truckValues.iftaReportingEnabled}
                onValueChange={(value) => setTruckValue("iftaReportingEnabled", value)}
              >
                <SelectTrigger id="w-ifta-reporting"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UNDECIDED">{copy.decideLater}</SelectItem>
                  <SelectItem value="INCLUDED">{truckCopy.includeIfta}</SelectItem>
                  <SelectItem value="EXCLUDED">{truckCopy.excludeIfta}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={truckCopy.monthlyPayment} htmlFor="w-payment">
              <Input
                id="w-payment"
                inputMode="decimal"
                value={truckValues.monthlyPayment}
                onChange={(e) => setTruckValue("monthlyPayment", e.target.value)}
                placeholder="1285"
              />
            </Field>
            <Field label={truckCopy.monthlyInsurance} htmlFor="w-insurance">
              <Input
                id="w-insurance"
                inputMode="decimal"
                value={truckValues.monthlyInsurance}
                onChange={(e) => setTruckValue("monthlyInsurance", e.target.value)}
                placeholder="685"
              />
            </Field>
          </div>

          <div
            className={cn(
              "mt-3 rounded-md border px-3 py-2 text-2xs leading-relaxed",
              currentIftaStatus === "LIKELY_REQUIRED"
                ? "border-warn/40 bg-warn-soft text-warn"
                : "border-border bg-surface-sunken/60 text-muted-foreground",
            )}
          >
            <span className="font-semibold">{iftaApplicabilityLabel(currentIftaStatus, locale)}.</span>{" "}
            {copy.qualificationExplanation}
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => setStep(2)}>
              {interpolate(copy.keepTruck, { truck: truck.name })}
            </Button>
            <Button type="button" onClick={saveTruck} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {copy.continue}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Target className="size-4 text-muted-foreground" />
            <h1 className="text-md font-semibold tracking-tight">{copy.runTitle}</h1>
          </div>
          <p className="mt-1 text-2xs text-muted-foreground">
            {copy.runDescription}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field
              label={copy.taxReserve}
              htmlFor="w-tax"
              hint={copy.taxHint}
            >
              <Input
                id="w-tax"
                inputMode="decimal"
                value={runValues.taxReservePct}
                onChange={(e) => setRunValue("taxReservePct", e.target.value)}
                autoFocus
              />
            </Field>
            <Field
              label={copy.maintenanceReserve}
              htmlFor="w-maint"
              hint={copy.maintenanceHint}
            >
              <Input
                id="w-maint"
                inputMode="decimal"
                value={runValues.maintenanceReservePct}
                onChange={(e) => setRunValue("maintenanceReservePct", e.target.value)}
              />
            </Field>
            <Field label={settingsCopy.monthlyRevenueTarget} htmlFor="w-rev">
              <Input
                id="w-rev"
                inputMode="decimal"
                value={runValues.monthlyRevenueTarget}
                onChange={(e) => setRunValue("monthlyRevenueTarget", e.target.value)}
                placeholder="15000"
              />
            </Field>
            <Field
              label={settingsCopy.monthlyProfitTarget}
              htmlFor="w-profit"
              hint={
                dailyTarget > 0
                  ? interpolate(settingsCopy.dailyProfitHint, { amount: formatMoney(dailyTarget) })
                  : copy.dailyVerdict
              }
            >
              <Input
                id="w-profit"
                inputMode="decimal"
                value={runValues.monthlyProfitTarget}
                onChange={(e) => setRunValue("monthlyProfitTarget", e.target.value)}
                placeholder="7500"
              />
            </Field>
            <Field label={settingsCopy.workingDays} htmlFor="w-days" className="sm:col-span-2">
              <Select
                value={runValues.workingDaysPerWeek}
                onValueChange={(value) => setRunValue("workingDaysPerWeek", value)}
              >
                <SelectTrigger id="w-days">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">{settingsCopy.mondayFriday}</SelectItem>
                  <SelectItem value="6">{settingsCopy.mondaySaturday}</SelectItem>
                  <SelectItem value="7">{settingsCopy.everyDay}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => setStep(3)}>
              {copy.skip}
            </Button>
            <Button type="button" onClick={saveHowYouRun} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {copy.continue}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="rounded-lg border border-border bg-card p-6 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-pos-soft">
            <Check className="size-5 text-pos" />
          </div>
          <h1 className="mt-3 text-lg font-semibold tracking-tight">
            {interpolate(copy.setupComplete, { business: businessName.trim() })}
          </h1>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
            {interpolate(copy.trialReady, { plan: planName })}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={finish}>
              {copy.openDashboard}
              <ArrowRight className="size-4" />
            </Button>
          </div>
          <p className="mt-4 text-2xs text-muted-foreground">
            {copy.changeLater}
          </p>
        </section>
      ) : null}
    </div>
  );
}
