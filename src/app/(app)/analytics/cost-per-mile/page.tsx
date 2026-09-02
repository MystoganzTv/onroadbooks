import type { Metadata } from "next";

import { AnalyticsTabs } from "@/components/cockpit/analytics-tabs";
import { TruckSwitcher } from "@/components/fleet/truck-switcher";
import { CostPerMileCard } from "@/components/cockpit/cost-per-mile-card";
import { PeriodControls } from "@/components/dashboard/period-controls";
import { MiniStat } from "@/components/dashboard/mini-stat";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { summarizePeriod } from "@/lib/calculations";
import { categoryColor, categoryLabel } from "@/lib/categories";
import { getDataset } from "@/lib/db";
import { calculateTrueCostPerMile, trailingCostBasis } from "@/lib/finance/cost-per-mile";
import {
  formatMoney,
  formatNumber,
  formatPercent,
  formatRateValue,
} from "@/lib/formatters";
import { expensesForTruck, loadsForTruck, orderedTrucks } from "@/lib/fleet";
import {
  periodFromSearchParams,
  truckFromSearchParams,
  type SearchParams,
} from "@/lib/period-params";
import { todayISO } from "@/lib/periods";
import type { CostLine } from "@/lib/finance/cost-per-mile";
import { cn } from "@/lib/utils";
import { getWebDictionary, interpolate, type WebDictionary } from "@/lib/i18n/dictionaries";
import { getAppLocale } from "@/lib/i18n-server";
import type { AppLocale } from "@/lib/i18n";
import { formatLocalePeriod } from "@/lib/i18n-format";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).analytics.costMetadata };
}

/**
 * Where every dollar of a mile goes.
 *
 * Two columns on purpose: the selected period (what actually happened) and
 * the trailing basis (what the calculator prices new loads on). Seeing them
 * side by side is how an owner notices that this half-month carried the
 * annual insurance bill and is not representative.
 */
export default async function CostPerMilePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [params, session, locale] = await Promise.all([
    searchParams,
    requireSession(),
    getAppLocale(),
  ]);
  const copy = getWebDictionary(locale).analytics;
  const {
    trucks,
    loads: allLoads,
    expenses: allExpenses,
    settings,
    paymentEvents,
  } = await getDataset(session.businessId);
  const period = periodFromSearchParams(params);

  // Scoped to a unit, this is that truck's own cost per mile: its loads and
  // the costs it caused, with no share of overhead imputed to it.
  const truckId = truckFromSearchParams(params, trucks);
  const loads = loadsForTruck(allLoads, truckId);
  const expenses = expensesForTruck(allExpenses, truckId);

  const summary = summarizePeriod(loads, expenses, period, settings, paymentEvents);
  const cost = calculateTrueCostPerMile(
    loads,
    expenses,
    period,
    settings,
    formatLocalePeriod(period, locale),
  );
  const basis = trailingCostBasis(loads, expenses, settings, todayISO());

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title={copy.actualCostTitle}
        description={copy.actualCostDescription}
      />
      <AnalyticsTabs />
      <div className="flex flex-wrap items-center gap-2">
        <PeriodControls period={period} />
        <TruckSwitcher trucks={orderedTrucks(trucks)} selectedId={truckId} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MiniStat
          label={copy.fixedPerMile}
          value={cost.sufficient ? formatRateValue(cost.fixedCostPerMile) : "—"}
          sub={formatMoney(cost.fixedTotal)}
          tone="info"
        />
        <MiniStat
          label={copy.variablePerMile}
          value={cost.sufficient ? formatRateValue(cost.variableCostPerMile) : "—"}
          sub={formatMoney(cost.variableTotal)}
          tone="warning"
        />
        <MiniStat
          label={copy.actualCostPerMile}
          value={cost.sufficient ? formatRateValue(cost.actualCostPerMile) : "—"}
          sub={formatMoney(cost.totalCost)}
          tone="negative"
        />
        <MiniStat
          label={copy.debtPerMile}
          value={cost.sufficient ? formatRateValue(cost.debtServicePerMile) : "—"}
          sub={formatMoney(cost.debtServiceTotal)}
          tone="warning"
        />
        <MiniStat
          label={copy.revenuePerMile}
          value={formatRateValue(summary.revenuePerMile)}
          sub={copy.allMiles}
          tone="info"
        />
        <MiniStat
          label={copy.keptPerMile}
          value={formatRateValue(summary.revenuePerMile - cost.actualCostPerMile)}
          sub={`${formatNumber(cost.totalMiles)} mi`}
          tone={summary.revenuePerMile - cost.actualCostPerMile >= 0 ? "positive" : "negative"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          <CostBreakdownTable
            title={copy.fixedCosts}
            description={copy.fixedDescription}
            lines={cost.fixed}
            totalMiles={cost.totalMiles}
            total={cost.fixedTotal}
            perMile={cost.fixedCostPerMile}
            copy={copy}
            locale={locale}
          />
          <CostBreakdownTable
            title={copy.variableCosts}
            description={copy.variableDescription}
            lines={cost.variable}
            totalMiles={cost.totalMiles}
            total={cost.variableTotal}
            perMile={cost.variableCostPerMile}
            copy={copy}
            locale={locale}
          />
        </div>

        <div className="min-w-0 space-y-4">
          <CostPerMileCard cost={cost} revenuePerMile={summary.revenuePerMile} />
          <CostPerMileCard cost={basis} compact />
          <Card className="border-dashed">
            <CardContent className="space-y-2 p-4 text-2xs leading-relaxed text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">{copy.whyTwo}</span>{" "}
                {copy.whyTwoDescription}
              </p>
              <p>
                {copy.debtExplanation}
              </p>
              <p>
                {copy.classificationExplanation}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function CostBreakdownTable({
  title,
  description,
  lines,
  totalMiles,
  total,
  perMile,
  copy,
  locale,
}: {
  title: string;
  description: string;
  lines: CostLine[];
  totalMiles: number;
  total: number;
  perMile: number;
  copy: WebDictionary["analytics"];
  locale: AppLocale;
}) {
  const max = lines.reduce((highest, line) => Math.max(highest, line.perMile), 0);

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <p className="mt-0.5 text-2xs text-muted-foreground">{description}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tnum text-lg font-semibold tracking-tight">{formatRateValue(perMile)}</p>
          <p className="text-2xs text-muted-foreground tnum">{formatMoney(total)}</p>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {lines.length === 0 || totalMiles === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">
            {copy.nothingInGroup}
          </p>
        ) : (
          <ul className="divide-y divide-border/70">
            {lines.map((line) => (
              <li
                key={line.category}
                className="grid grid-cols-[8rem_1fr_5rem_4.5rem] items-center gap-3 px-4 py-2.5"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: categoryColor(line.category) }}
                    aria-hidden
                  />
                  <span className="truncate text-xs text-foreground">{categoryLabel(line.category, locale)}</span>
                </span>
                <span className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${max > 0 ? (line.perMile / max) * 100 : 0}%`,
                      backgroundColor: categoryColor(line.category),
                    }}
                  />
                </span>
                <span className="text-right tnum text-xs text-muted-foreground">
                  {formatMoney(line.amount)}
                </span>
                <span className={cn("text-right tnum text-sm font-semibold text-foreground")}>
                  {formatRateValue(line.perMile)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {lines.length > 0 ? (
          <p className="border-t border-border px-4 py-2 text-2xs text-muted-foreground tnum">
            {interpolate(copy.shareSpent, {
              percent: formatPercent(lines.reduce((sum, l) => sum + l.share, 0)),
            })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
