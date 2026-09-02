"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Target } from "lucide-react";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";

import { Field } from "@/components/shared/field";
import { useLanguage } from "@/components/shell/language-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateGoalsAction } from "@/lib/actions/goals";
import { fieldErrors, focusFirstError, validationMessage } from "@/lib/form";
import { formatMoney } from "@/lib/formatters";
import { interpolate } from "@/lib/i18n/dictionaries";
import { goalSchema } from "@/lib/schemas";
import type { FinancialGoal } from "@/lib/types";
import { toNumber, toRequiredNumber } from "@/lib/utils";

/**
 * Targets are monthly. Everything shorter is pro-rated by working days and
 * labelled as pro-rated, which is why the working week matters here: it also
 * sets the daily profit target and the month-end projection.
 */
export function GoalsForm({ goals }: { goals: FinancialGoal }) {
  const router = useRouter();
  const { dictionary } = useLanguage();
  const copy = dictionary.settings;
  const fieldLabels: Record<string, string> = {
    monthlyRevenueTarget: copy.monthlyRevenueTarget, monthlyProfitTarget: copy.monthlyProfitTarget,
    targetProfitPerMile: copy.targetProfitMile, maxDeadheadPct: copy.maximumDeadhead,
    targetLoads: copy.targetLoads, workingDaysPerWeek: copy.workingDays,
    expectedMonthlyMiles: copy.expectedMonthlyMiles,
  };
  const dayOptions = [
    { value: "5", label: copy.mondayFriday },
    { value: "6", label: copy.mondaySaturday },
    { value: "7", label: copy.everyDay },
  ];
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const [values, setValues] = React.useState({
    monthlyRevenueTarget: String(goals.monthlyRevenueTarget || ""),
    monthlyProfitTarget: String(goals.monthlyProfitTarget || ""),
    targetProfitPerMile: String(goals.targetProfitPerMile || ""),
    maxDeadheadPct: String(goals.maxDeadheadPct || ""),
    targetLoads: goals.targetLoads != null ? String(goals.targetLoads) : "",
    workingDaysPerWeek: String(goals.workingDaysPerWeek || 6),
    expectedMonthlyMiles: String(goals.expectedMonthlyMiles || ""),
  });

  const set = (key: keyof typeof values, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const workingDays = toNumber(values.workingDaysPerWeek, 6);
  // ~4.345 weeks in an average month; used only for the preview line.
  const monthlyWorkingDays = Math.max(1, Math.round(workingDays * 4.345));
  const dailyProfit = toNumber(values.monthlyProfitTarget) / monthlyWorkingDays;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const payload = {
      monthlyRevenueTarget: toRequiredNumber(values.monthlyRevenueTarget),
      monthlyProfitTarget: toRequiredNumber(values.monthlyProfitTarget),
      targetProfitPerMile: toRequiredNumber(values.targetProfitPerMile),
      maxDeadheadPct: toRequiredNumber(values.maxDeadheadPct),
      targetLoads: values.targetLoads === "" ? null : toRequiredNumber(values.targetLoads),
      workingDaysPerWeek: toRequiredNumber(values.workingDaysPerWeek),
      expectedMonthlyMiles: toRequiredNumber(values.expectedMonthlyMiles),
    };

    const parsed = goalSchema.safeParse(payload);
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors(next);
      toast.error(validationMessage(next, fieldLabels));
      requestAnimationFrame(() => focusFirstError("goals-form"));
      return;
    }

    setErrors({});
    startTransition(async () => {
      const result = await updateGoalsAction(payload);
      if (result.ok) {
        toast.success(copy.targetsSaved);
        router.refresh();
      } else {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(localizedClientError(result.error));
      }
    });
  }

  return (
    <Card id="goals">
      <form id="goals-form" onSubmit={submit}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Target className="size-3.5 text-muted-foreground" />
            <CardTitle>{copy.targets}</CardTitle>
          </div>
          <span className="text-2xs text-muted-foreground">{copy.targetsDescription}</span>
        </CardHeader>

        <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
          <Field
            label={copy.monthlyRevenueTarget}
            htmlFor="goal-revenue"
            required
            error={errors.monthlyRevenueTarget}
          >
            <Input
              id="goal-revenue"
              inputMode="decimal"
              value={values.monthlyRevenueTarget}
              onChange={(e) => set("monthlyRevenueTarget", e.target.value)}
            />
          </Field>

          <Field
            label={copy.monthlyProfitTarget}
            htmlFor="goal-profit"
            required
            error={errors.monthlyProfitTarget}
            hint={
              dailyProfit > 0
                ? interpolate(copy.dailyProfitHint, { amount: formatMoney(dailyProfit) })
                : copy.dailyVerdictHint
            }
          >
            <Input
              id="goal-profit"
              inputMode="decimal"
              value={values.monthlyProfitTarget}
              onChange={(e) => set("monthlyProfitTarget", e.target.value)}
            />
          </Field>

          <Field
            label={copy.targetProfitMile}
            htmlFor="goal-ppm"
            required
            error={errors.targetProfitPerMile}
            hint={copy.calculatorDefault}
          >
            <Input
              id="goal-ppm"
              inputMode="decimal"
              value={values.targetProfitPerMile}
              onChange={(e) => set("targetProfitPerMile", e.target.value)}
            />
          </Field>

          <Field
            label={copy.maximumDeadhead}
            htmlFor="goal-deadhead"
            required
            error={errors.maxDeadheadPct}
            hint={copy.ceilingNotTarget}
          >
            <Input
              id="goal-deadhead"
              inputMode="decimal"
              value={values.maxDeadheadPct}
              onChange={(e) => set("maxDeadheadPct", e.target.value)}
            />
          </Field>

          <Field
            label={copy.targetLoads}
            htmlFor="goal-loads"
            error={errors.targetLoads}
            hint={copy.optional}
          >
            <Input
              id="goal-loads"
              inputMode="numeric"
              value={values.targetLoads}
              onChange={(e) => set("targetLoads", e.target.value)}
            />
          </Field>

          <Field
            label={copy.expectedMonthlyMiles}
            htmlFor="goal-miles"
            required
            error={errors.expectedMonthlyMiles}
            hint={copy.planningOnly}
          >
            <Input
              id="goal-miles"
              inputMode="numeric"
              value={values.expectedMonthlyMiles}
              onChange={(e) => set("expectedMonthlyMiles", e.target.value)}
            />
          </Field>

          <Field
            label={copy.workingDays}
            htmlFor="goal-days"
            required
            error={errors.workingDaysPerWeek}
            hint={copy.workingDaysHint}
          >
            <Select
              value={values.workingDaysPerWeek}
              onValueChange={(value) => set("workingDaysPerWeek", value)}
            >
              <SelectTrigger id="goal-days">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dayOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>

        <CardFooter className="justify-end gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {copy.saveTargets}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
