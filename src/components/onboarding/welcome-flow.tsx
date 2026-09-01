"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2, Target, TruckIcon } from "lucide-react";
import { toast } from "sonner";

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
import type { Business, FinancialGoal, FinancialSettings, Truck } from "@/lib/types";
import { cn, toNumber, toRequiredNumber } from "@/lib/utils";

interface WelcomeFlowProps {
  business: Business;
  truck: Truck;
  settings: FinancialSettings;
  goals: FinancialGoal;
  planName: string;
}

const STEPS = ["Your truck", "How you run", "Done"] as const;

/**
 * What happens after the account exists.
 *
 * Every step is skippable and every step writes through the same server
 * actions the Settings page uses -- there is no separate onboarding write
 * path that could drift from the real one. Nothing here is required, because
 * an owner who wants to look around first should be able to.
 */
export function WelcomeFlow({ business, truck, settings, goals, planName }: WelcomeFlowProps) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [pending, startTransition] = React.useTransition();

  const [truckValues, setTruckValues] = React.useState({
    name: truck.name,
    year: truck.year ? String(truck.year) : "",
    make: truck.make ?? "",
    model: truck.model ?? "",
    currentOdometer: String(truck.currentOdometer || ""),
    monthlyPayment: truck.monthlyPayment ? String(truck.monthlyPayment) : "",
    monthlyInsurance: truck.monthlyInsurance ? String(truck.monthlyInsurance) : "",
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
        startingOdometer: truck.startingOdometer,
        currentOdometer:
          toRequiredNumber(truckValues.currentOdometer) ?? truck.currentOdometer,
      });

      if (result.ok) setStep(1);
      else toast.error(result.error);
    });
  }

  function saveHowYouRun() {
    startTransition(async () => {
      const settingsResult = await updateSettingsAction({
        businessName: business.name,
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
        toast.error(settingsResult.error);
        return;
      }

      const goalsResult = await updateGoalsAction({
        monthlyRevenueTarget: toNumber(runValues.monthlyRevenueTarget, goals.monthlyRevenueTarget),
        monthlyProfitTarget: toNumber(runValues.monthlyProfitTarget, goals.monthlyProfitTarget),
        targetProfitPerMile: goals.targetProfitPerMile,
        maxDeadheadPct: goals.maxDeadheadPct,
        targetLoads: goals.targetLoads,
        workingDaysPerWeek: toNumber(runValues.workingDaysPerWeek, goals.workingDaysPerWeek),
      });

      if (goalsResult.ok) setStep(2);
      else toast.error(goalsResult.error);
    });
  }

  function finish() {
    router.replace("/dashboard");
  }

  const workingDays = toNumber(runValues.workingDaysPerWeek, 6);
  const dailyTarget = toNumber(runValues.monthlyProfitTarget) / Math.max(1, Math.round(workingDays * 4.345));

  return (
    <div className="mx-auto w-full max-w-2xl p-4 py-8 lg:py-12">
      <ol className="mb-6 flex items-center gap-2" aria-label="Setup progress">
        {STEPS.map((label, index) => (
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
            {index < STEPS.length - 1 ? (
              <span className="h-px flex-1 bg-border" aria-hidden />
            ) : null}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <TruckIcon className="size-4 text-muted-foreground" />
            <h1 className="text-md font-semibold tracking-tight">Tell us about the truck</h1>
          </div>
          <p className="mt-1 text-2xs text-muted-foreground">
            Insurance contributes to operating cost per mile. The truck payment is tracked
            separately as debt-service cash burden. You can change this later on the Truck page.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Name it" htmlFor="w-name" hint="However you refer to it">
              <Input
                id="w-name"
                value={truckValues.name}
                onChange={(e) => setTruckValue("name", e.target.value)}
                placeholder="Unit 101"
                maxLength={80}
                autoFocus
              />
            </Field>
            <Field label="Current odometer" htmlFor="w-odo">
              <Input
                id="w-odo"
                inputMode="numeric"
                value={truckValues.currentOdometer}
                onChange={(e) => setTruckValue("currentOdometer", e.target.value)}
              />
            </Field>
            <Field label="Year" htmlFor="w-year">
              <Input
                id="w-year"
                inputMode="numeric"
                value={truckValues.year}
                onChange={(e) => setTruckValue("year", e.target.value)}
                placeholder="2021"
              />
            </Field>
            <Field label="Make and model" htmlFor="w-make">
              <div className="flex gap-2">
                <Input
                  id="w-make"
                  value={truckValues.make}
                  onChange={(e) => setTruckValue("make", e.target.value)}
                  placeholder="Freightliner"
                />
                <Input
                  aria-label="Model"
                  value={truckValues.model}
                  onChange={(e) => setTruckValue("model", e.target.value)}
                  placeholder="M2 106"
                />
              </div>
            </Field>
            <Field label="Monthly truck payment" htmlFor="w-payment">
              <Input
                id="w-payment"
                inputMode="decimal"
                value={truckValues.monthlyPayment}
                onChange={(e) => setTruckValue("monthlyPayment", e.target.value)}
                placeholder="1285"
              />
            </Field>
            <Field label="Monthly insurance" htmlFor="w-insurance">
              <Input
                id="w-insurance"
                inputMode="decimal"
                value={truckValues.monthlyInsurance}
                onChange={(e) => setTruckValue("monthlyInsurance", e.target.value)}
                placeholder="685"
              />
            </Field>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => setStep(1)}>
              Skip for now
            </Button>
            <Button type="button" onClick={saveTruck} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Continue
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Target className="size-4 text-muted-foreground" />
            <h1 className="text-md font-semibold tracking-tight">How you run the business</h1>
          </div>
          <p className="mt-1 text-2xs text-muted-foreground">
            These drive Safe to Pay Yourself and the pace tracker. Sensible defaults are filled
            in — adjust them when you know your own numbers.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field
              label="Tax reserve"
              htmlFor="w-tax"
              hint="Percent of operating profit set aside"
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
              label="Maintenance reserve"
              htmlFor="w-maint"
              hint="Percent of Booked Revenue set aside"
            >
              <Input
                id="w-maint"
                inputMode="decimal"
                value={runValues.maintenanceReservePct}
                onChange={(e) => setRunValue("maintenanceReservePct", e.target.value)}
              />
            </Field>
            <Field label="Monthly revenue target" htmlFor="w-rev">
              <Input
                id="w-rev"
                inputMode="decimal"
                value={runValues.monthlyRevenueTarget}
                onChange={(e) => setRunValue("monthlyRevenueTarget", e.target.value)}
                placeholder="15000"
              />
            </Field>
            <Field
              label="Monthly profit target"
              htmlFor="w-profit"
              hint={
                dailyTarget > 0
                  ? `About ${formatMoney(dailyTarget)} a working day`
                  : "Drives the daily verdict"
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
            <Field label="Working days a week" htmlFor="w-days" className="sm:col-span-2">
              <Select
                value={runValues.workingDaysPerWeek}
                onValueChange={(value) => setRunValue("workingDaysPerWeek", value)}
              >
                <SelectTrigger id="w-days">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 — Monday to Friday</SelectItem>
                  <SelectItem value="6">6 — Monday to Saturday</SelectItem>
                  <SelectItem value="7">7 — every day</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => setStep(2)}>
              Skip for now
            </Button>
            <Button type="button" onClick={saveHowYouRun} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Continue
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="rounded-lg border border-border bg-card p-6 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-pos-soft">
            <Check className="size-5 text-pos" />
          </div>
          <h1 className="mt-3 text-lg font-semibold tracking-tight">
            {business.name} is set up
          </h1>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
            You are starting a 7-day {planName} trial. This workspace is private and empty by
            design — add your first load when you are ready.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={finish}>
              Open the dashboard
              <ArrowRight className="size-4" />
            </Button>
          </div>
          <p className="mt-4 text-2xs text-muted-foreground">
            Everything here can be changed later under Business Settings.
          </p>
        </section>
      ) : null}
    </div>
  );
}
