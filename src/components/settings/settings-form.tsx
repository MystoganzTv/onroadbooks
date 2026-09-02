"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";

import { Field } from "@/components/shared/field";
import { useLanguage } from "@/components/shell/language-provider";
import { fieldErrors, focusFirstError, validationMessage } from "@/lib/form";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { updateSettingsAction } from "@/lib/actions/settings";
import { calculateSafeOwnerPay, resolveReserveRules } from "@/lib/finance/owner-pay";
import { categoryColor, categoryLabel, defaultCategoryBehavior, EXPENSE_CATEGORIES } from "@/lib/categories";
import { formatMoney } from "@/lib/formatters";
import { interpolate, type WebDictionary } from "@/lib/i18n/dictionaries";
import { settingsSchema } from "@/lib/schemas";
import type {
  Business,
  ExpenseBehavior,
  FinancialSettings,
  PeriodSummary,
  ReserveAccount,
} from "@/lib/types";
import { cn, toNumber, toRequiredNumber } from "@/lib/utils";

interface SettingsFormProps {
  business: Business;
  settings: FinancialSettings;
  /** Live period figures so the reserve preview uses real numbers. */
  preview: PeriodSummary;
  previewLabel: string;
  /** Every bucket, so the preview shows the same Safe to Pay as the app. */
  reserveAccounts: ReserveAccount[];
}

export function SettingsForm({
  business,
  settings,
  preview,
  previewLabel,
  reserveAccounts,
}: SettingsFormProps) {
  const router = useRouter();
  const { locale, dictionary } = useLanguage();
  const copy = dictionary.settings;
  const fieldLabels: Record<string, string> = {
    businessName: copy.businessName, currency: copy.currency, taxReservePct: copy.taxReserve,
    maintenanceReservePct: copy.maintenanceReserve, ratingGreatPerMile: copy.greatAt,
    ratingGoodPerMile: copy.goodAt, ratingMarginalPerMile: copy.marginalAt,
    deadheadWarnPct: copy.deadheadWarning, maintenanceWarnMiles: copy.maintenanceMiles,
    maintenanceWarnDays: copy.maintenanceDays,
  };
  const [businessName, setBusinessName] = React.useState(business.name);
  // Fixed at USD until a second currency exists; kept in state so the
  // payload shape does not change when one does.
  const [currency] = React.useState(business.currency);
  const [taxPct, setTaxPct] = React.useState(String(settings.taxReservePct));
  const [maintenancePct, setMaintenancePct] = React.useState(
    String(settings.maintenanceReservePct),
  );
  const [behavior, setBehavior] = React.useState<Record<string, ExpenseBehavior>>({
    ...defaultCategoryBehavior(),
    ...settings.categoryBehavior,
  });
  const [ratingGreat, setRatingGreat] = React.useState(String(settings.ratingGreatPerMile));
  const [ratingGood, setRatingGood] = React.useState(String(settings.ratingGoodPerMile));
  const [ratingMarginal, setRatingMarginal] = React.useState(
    String(settings.ratingMarginalPerMile),
  );
  const [deadheadWarn, setDeadheadWarn] = React.useState(String(settings.deadheadWarnPct));
  const [warnMiles, setWarnMiles] = React.useState(String(settings.maintenanceWarnMiles));
  const [warnDays, setWarnDays] = React.useState(String(settings.maintenanceWarnDays));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [pending, startTransition] = React.useTransition();

  // The same engine the dashboard and settlements use, fed the values being
  // typed: every active bucket appears, not just the two built-ins, so the
  // preview's bottom line matches the Safe to Pay shown everywhere else.
  const livePreview = calculateSafeOwnerPay(
    preview,
    resolveReserveRules(
      {
        taxReservePct: toNumber(taxPct),
        maintenanceReservePct: toNumber(maintenancePct),
      },
      reserveAccounts,
    ),
  );

  function submit(event: React.FormEvent) {
    event.preventDefault();

    const payload = {
      businessName,
      currency,
      taxReservePct: toRequiredNumber(taxPct),
      maintenanceReservePct: toRequiredNumber(maintenancePct),
      categoryBehavior: behavior,
      ratingGreatPerMile: toRequiredNumber(ratingGreat),
      ratingGoodPerMile: toRequiredNumber(ratingGood),
      ratingMarginalPerMile: toRequiredNumber(ratingMarginal),
      deadheadWarnPct: toRequiredNumber(deadheadWarn),
      maintenanceWarnMiles: roundOrMissing(warnMiles),
      maintenanceWarnDays: roundOrMissing(warnDays),
    };

    const parsed = settingsSchema.safeParse(payload);
    if (!parsed.success) {
      const next = fieldErrors(parsed.error);
      setErrors(next);
      // A failure the user cannot see is a dead button: announce it, name the
      // fields, and move focus to the first one.
      toast.error(validationMessage(next, fieldLabels));
      requestAnimationFrame(() => focusFirstError("settings-form"));
      return;
    }

    setErrors({});
    startTransition(async () => {
      const result = await updateSettingsAction(payload);
      if (result.ok) {
        toast.success(copy.saved, {
          description: copy.recalculated,
        });
        router.refresh();
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(localizedClientError(result.error));
      }
    });
  }

  function resetDefaults() {
    setTaxPct("20");
    setMaintenancePct("5");
    setRatingGreat("2");
    setRatingGood("1.5");
    setRatingMarginal("1");
    setDeadheadWarn("20");
    setWarnMiles("2000");
    setWarnDays("30");
    setBehavior(defaultCategoryBehavior());
    toast.info(copy.defaultsRestored);
  }

  return (
    <form id="settings-form" onSubmit={submit} noValidate className="space-y-4">
      <section className="rounded-lg border border-border bg-card">
        <CardHeader>
          <CardTitle>{copy.business}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
          <Field
            label={copy.businessName}
            htmlFor="business-name"
            required
            error={errors.businessName}
            className="sm:col-span-2"
          >
            <Input
              id="business-name"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              required
              aria-invalid={Boolean(errors.businessName)}
            />
          </Field>
          <Field
            label={copy.currency}
            htmlFor="business-currency"
            hint={copy.usdOnly}
            error={errors.currency}
          >
            <Input id="business-currency" value={`${currency} - ${copy.usDollar}`} readOnly disabled />
          </Field>
        </CardContent>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <CardHeader>
          <CardTitle>{copy.financialDefaults}</CardTitle>
          <span className="text-2xs text-muted-foreground">{interpolate(copy.preview, { period: previewLabel })}</span>
        </CardHeader>
        <CardContent className="grid gap-4 p-4 lg:grid-cols-2">
          <div className="space-y-3">
            <Field
              label={copy.taxReserve}
              htmlFor="tax-pct"
              required
              error={errors.taxReservePct}
              hint={copy.taxReserveHint}
            >
              <Input
                id="tax-pct"
                type="number"
                aria-invalid={Boolean(errors.taxReservePct)}
                min={0}
                max={100}
                step="0.5"
                value={taxPct}
                onChange={(e) => setTaxPct(e.target.value)}
                required
              />
            </Field>
            <Field
              label={copy.maintenanceReserve}
              htmlFor="maintenance-pct"
              required
              error={errors.maintenanceReservePct}
              hint={copy.maintenanceReserveHint}
            >
              <Input
                id="maintenance-pct"
                type="number"
                aria-invalid={Boolean(errors.maintenanceReservePct)}
                min={0}
                max={100}
                step="0.5"
                value={maintenancePct}
                onChange={(e) => setMaintenancePct(e.target.value)}
                required
              />
            </Field>
          </div>

          <div className="rounded-md border border-border bg-surface-sunken p-3">
            <p className="label-xs">{copy.livePreview}</p>
            <ul className="mt-2 space-y-1 text-sm">
              <PreviewRow label={copy.operatingProfit} value={formatMoney(livePreview.operatingProfit)} />
              {livePreview.reserves.map((reserve) => (
                <PreviewRow
                  key={reserve.accountId}
                  label={`${reserve.name} ${reserve.pct}%`}
                  value={`-${formatMoney(reserve.amount)}`}
                  tone="neg"
                />
              ))}
            </ul>
            <div className="mt-2 border-t border-border pt-2">
              <PreviewRow
                label={copy.availableToYou}
                value={formatMoney(livePreview.safeToPay)}
                tone={livePreview.safeToPay >= 0 ? "pos" : "neg"}
                strong
              />
            </div>
          </div>
        </CardContent>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <CardHeader>
          <CardTitle>{copy.profitabilityThresholds}</CardTitle>
          <span className="text-2xs text-muted-foreground">{copy.contributionPerTotalMile}</span>
        </CardHeader>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label={copy.greatAt}
              htmlFor="rating-great"
              required
              error={errors.ratingGreatPerMile}
            >
              <Input
                id="rating-great"
                type="number"
                aria-invalid={Boolean(errors.ratingGreatPerMile)}
                min={0}
                step="0.05"
                value={ratingGreat}
                onChange={(e) => setRatingGreat(e.target.value)}
                required
              />
            </Field>
            <Field
              label={copy.goodAt}
              htmlFor="rating-good"
              required
              error={errors.ratingGoodPerMile}
            >
              <Input
                id="rating-good"
                type="number"
                aria-invalid={Boolean(errors.ratingGoodPerMile)}
                min={0}
                step="0.05"
                value={ratingGood}
                onChange={(e) => setRatingGood(e.target.value)}
                required
              />
            </Field>
            <Field
              label={copy.marginalAt}
              htmlFor="rating-marginal"
              required
              hint={copy.belowBad}
              error={errors.ratingMarginalPerMile}
            >
              <Input
                id="rating-marginal"
                type="number"
                aria-invalid={Boolean(errors.ratingMarginalPerMile)}
                min={0}
                step="0.05"
                value={ratingMarginal}
                onChange={(e) => setRatingMarginal(e.target.value)}
                required
              />
            </Field>
          </div>

          <RatingScale
            great={toNumber(ratingGreat)}
            good={toNumber(ratingGood)}
            marginal={toNumber(ratingMarginal)}
            copy={copy}
          />

          <p className="text-2xs leading-relaxed text-muted-foreground">
            {copy.ratingExplanation}
          </p>
        </CardContent>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <CardHeader>
          <CardTitle>{copy.warningThresholds}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-3">
          <Field
            label={copy.deadheadWarning}
            htmlFor="deadhead-warn"
            required
            hint={copy.deadheadWarningHint}
            error={errors.deadheadWarnPct}
          >
            <Input
              id="deadhead-warn"
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={deadheadWarn}
              onChange={(e) => setDeadheadWarn(e.target.value)}
              required
            />
          </Field>
          <Field
            label={copy.maintenanceMiles}
            htmlFor="warn-miles"
            required
            hint={copy.maintenanceMilesHint}
            error={errors.maintenanceWarnMiles}
          >
            <Input
              id="warn-miles"
              type="number"
              min={0}
              step={100}
              value={warnMiles}
              onChange={(e) => setWarnMiles(e.target.value)}
              required
            />
          </Field>
          <Field
            label={copy.maintenanceDays}
            htmlFor="warn-days"
            required
            hint={copy.maintenanceDaysHint}
            error={errors.maintenanceWarnDays}
          >
            <Input
              id="warn-days"
              type="number"
              min={0}
              max={365}
              step={1}
              value={warnDays}
              onChange={(e) => setWarnDays(e.target.value)}
              required
            />
          </Field>
        </CardContent>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <CardHeader>
          <CardTitle>{copy.expenseClassification}</CardTitle>
          <span className="text-2xs text-muted-foreground">
            {copy.expenseClassificationHint}
          </span>
        </CardHeader>
        <CardContent className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {EXPENSE_CATEGORIES.map((category) => {
            const value = behavior[category.id] ?? category.defaultBehavior;
            return (
              <div
                key={category.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-sunken px-2.5 py-1.5"
              >
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <span
                    className="size-2 shrink-0 rounded-[2px]"
                    style={{ background: categoryColor(category.id) }}
                    aria-hidden
                  />
                  <span className="truncate">{categoryLabel(category.id, locale)}</span>
                </span>
                <div
                  className="flex shrink-0 rounded border border-border bg-card p-0.5"
                  role="group"
                  aria-label={interpolate(copy.classificationFor, { category: categoryLabel(category.id, locale) })}
                >
                  {(["FIXED", "VARIABLE"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={value === option}
                      onClick={() =>
                        setBehavior((prev) => ({ ...prev, [category.id]: option }))
                      }
                      className={cn(
                        "rounded px-1.5 py-0.5 text-2xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        value === option
                          ? option === "FIXED"
                            ? "bg-info-soft text-info"
                            : "bg-warn-soft text-warn"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {option === "FIXED" ? copy.fixed : copy.variable}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
        <CardFooter className="justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={resetDefaults}>
            <RotateCcw />
            {copy.restoreDefaults}
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />}
            {copy.saveSettings}
          </Button>
        </CardFooter>
      </section>
    </form>
  );
}

/** Rounds a required whole-number field, preserving "missing". */
function roundOrMissing(value: string): number | undefined {
  const n = toRequiredNumber(value);
  return n === undefined ? undefined : Math.round(n);
}

function PreviewRow({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
  strong?: boolean;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className={cn("text-muted-foreground", strong && "text-foreground")}>{label}</span>
      <span
        className={cn(
          "tnum",
          strong && "text-base font-semibold",
          tone === "pos" && "text-pos",
          tone === "neg" && "text-neg",
        )}
      >
        {value}
      </span>
    </li>
  );
}

/** Visual key for how the four ratings sit against each other. */
function RatingScale({
  great,
  good,
  marginal,
  copy,
}: {
  great: number;
  good: number;
  marginal: number;
  copy: WebDictionary["settings"];
}) {
  const bands = [
    { label: copy.bad, range: `${copy.below} ${marginal.toFixed(2)}`, className: "bg-neg" },
    {
      label: copy.marginal,
      range: `${marginal.toFixed(2)} - ${good.toFixed(2)}`,
      className: "bg-warn",
    },
    { label: copy.good, range: `${good.toFixed(2)} - ${great.toFixed(2)}`, className: "bg-info" },
    { label: copy.great, range: `${great.toFixed(2)}+`, className: "bg-pos" },
  ];

  return (
    <div className="grid grid-cols-4 gap-1">
      {bands.map((band) => (
        <div key={band.label}>
          <div className={cn("h-1.5 rounded-full", band.className)} />
          <p className="mt-1 text-2xs font-medium">{band.label}</p>
          <p className="text-2xs text-muted-foreground tnum">{band.range}</p>
        </div>
      ))}
    </div>
  );
}
