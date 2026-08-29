"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Target } from "lucide-react";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
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
import { goalSchema } from "@/lib/schemas";
import type { FinancialGoal } from "@/lib/types";
import { toNumber, toRequiredNumber } from "@/lib/utils";

const FIELD_LABELS: Record<string, string> = {
  monthlyRevenueTarget: "Monthly revenue target",
  monthlyProfitTarget: "Monthly profit target",
  targetProfitPerMile: "Target profit per mile",
  maxDeadheadPct: "Maximum deadhead",
  targetLoads: "Target loads",
  workingDaysPerWeek: "Working days per week",
};

const DAY_OPTIONS = [
  { value: "5", label: "5 — Monday to Friday" },
  { value: "6", label: "6 — Monday to Saturday" },
  { value: "7", label: "7 — every day" },
];

/**
 * Targets are monthly. Everything shorter is pro-rated by working days and
 * labelled as pro-rated, which is why the working week matters here: it also
 * sets the daily profit target and the month-end projection.
 */
export function GoalsForm({ goals }: { goals: FinancialGoal }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const [values, setValues] = React.useState({
    monthlyRevenueTarget: String(goals.monthlyRevenueTarget || ""),
    monthlyProfitTarget: String(goals.monthlyProfitTarget || ""),
    targetProfitPerMile: String(goals.targetProfitPerMile || ""),
    maxDeadheadPct: String(goals.maxDeadheadPct || ""),
    targetLoads: goals.targetLoads != null ? String(goals.targetLoads) : "",
    workingDaysPerWeek: String(goals.workingDaysPerWeek || 6),
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
    };

    const parsed = goalSchema.safeParse(payload);
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors(next);
      toast.error(validationMessage(next, FIELD_LABELS));
      requestAnimationFrame(() => focusFirstError("goals-form"));
      return;
    }

    setErrors({});
    startTransition(async () => {
      const result = await updateGoalsAction(payload);
      if (result.ok) {
        toast.success("Targets saved");
        router.refresh();
      } else {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error);
      }
    });
  }

  return (
    <Card id="goals">
      <form id="goals-form" onSubmit={submit}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Target className="size-3.5 text-muted-foreground" />
            <CardTitle>Targets</CardTitle>
          </div>
          <span className="text-2xs text-muted-foreground">Monthly, pro-rated per period</span>
        </CardHeader>

        <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
          <Field
            label="Monthly revenue target"
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
            label="Monthly profit target"
            htmlFor="goal-profit"
            required
            error={errors.monthlyProfitTarget}
            hint={
              dailyProfit > 0
                ? `About ${formatMoney(dailyProfit)} a working day`
                : "Drives the daily verdict on the dashboard"
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
            label="Target profit / mile"
            htmlFor="goal-ppm"
            required
            error={errors.targetProfitPerMile}
            hint="Also the default in the target rate calculator"
          >
            <Input
              id="goal-ppm"
              inputMode="decimal"
              value={values.targetProfitPerMile}
              onChange={(e) => set("targetProfitPerMile", e.target.value)}
            />
          </Field>

          <Field
            label="Maximum deadhead %"
            htmlFor="goal-deadhead"
            required
            error={errors.maxDeadheadPct}
            hint="A ceiling, not a target"
          >
            <Input
              id="goal-deadhead"
              inputMode="decimal"
              value={values.maxDeadheadPct}
              onChange={(e) => set("maxDeadheadPct", e.target.value)}
            />
          </Field>

          <Field
            label="Target loads a month"
            htmlFor="goal-loads"
            error={errors.targetLoads}
            hint="Optional"
          >
            <Input
              id="goal-loads"
              inputMode="numeric"
              value={values.targetLoads}
              onChange={(e) => set("targetLoads", e.target.value)}
            />
          </Field>

          <Field
            label="Working days a week"
            htmlFor="goal-days"
            required
            error={errors.workingDaysPerWeek}
            hint="Sets the daily target and the month-end projection"
          >
            <Select
              value={values.workingDaysPerWeek}
              onValueChange={(value) => set("workingDaysPerWeek", value)}
            >
              <SelectTrigger id="goal-days">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_OPTIONS.map((option) => (
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
            Save targets
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
