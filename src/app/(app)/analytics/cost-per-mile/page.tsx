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
import { categoryColor } from "@/lib/categories";
import { getRepository } from "@/lib/db";
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

export const metadata: Metadata = { title: "Cost per Mile" };

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
  const params = await searchParams;
  const session = await requireSession();
  const {
    trucks,
    loads: allLoads,
    expenses: allExpenses,
    settings,
    paymentEvents,
  } = await getRepository(session.businessId).getDataset();
  const period = periodFromSearchParams(params);

  // Scoped to a unit, this is that truck's own cost per mile: its loads and
  // the costs it caused, with no share of overhead imputed to it.
  const truckId = truckFromSearchParams(params, trucks);
  const loads = loadsForTruck(allLoads, truckId);
  const expenses = expensesForTruck(allExpenses, truckId);

  const summary = summarizePeriod(loads, expenses, period, settings, paymentEvents);
  const cost = calculateTrueCostPerMile(loads, expenses, period, settings, period.label);
  const basis = trailingCostBasis(loads, expenses, settings, todayISO());

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title="Actual Cost per Mile"
        description="Actual operating expenses over actual miles, with Debt Service shown separately. Nothing prorated."
      />
      <AnalyticsTabs />
      <div className="flex flex-wrap items-center gap-2">
        <PeriodControls period={period} />
        <TruckSwitcher trucks={orderedTrucks(trucks)} selectedId={truckId} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MiniStat
          label="Fixed / Mile"
          value={cost.sufficient ? formatRateValue(cost.fixedCostPerMile) : "—"}
          sub={formatMoney(cost.fixedTotal)}
          tone="info"
        />
        <MiniStat
          label="Variable / Mile"
          value={cost.sufficient ? formatRateValue(cost.variableCostPerMile) : "—"}
          sub={formatMoney(cost.variableTotal)}
          tone="warning"
        />
        <MiniStat
          label="Actual Cost / Mile"
          value={cost.sufficient ? formatRateValue(cost.actualCostPerMile) : "—"}
          sub={formatMoney(cost.totalCost)}
          tone="negative"
        />
        <MiniStat
          label="Debt Service / Mile"
          value={cost.sufficient ? formatRateValue(cost.debtServicePerMile) : "—"}
          sub={formatMoney(cost.debtServiceTotal)}
          tone="warning"
        />
        <MiniStat
          label="Revenue / Mile"
          value={formatRateValue(summary.revenuePerMile)}
          sub="all miles"
          tone="info"
        />
        <MiniStat
          label="Kept / Mile"
          value={formatRateValue(summary.revenuePerMile - cost.actualCostPerMile)}
          sub={`${formatNumber(cost.totalMiles)} mi`}
          tone={summary.revenuePerMile - cost.actualCostPerMile >= 0 ? "positive" : "negative"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          <CostBreakdownTable
            title="Fixed costs"
            description="Costs the truck carries whether or not it moves"
            lines={cost.fixed}
            totalMiles={cost.totalMiles}
            total={cost.fixedTotal}
            perMile={cost.fixedCostPerMile}
          />
          <CostBreakdownTable
            title="Variable costs"
            description="Costs that follow the miles"
            lines={cost.variable}
            totalMiles={cost.totalMiles}
            total={cost.variableTotal}
            perMile={cost.variableCostPerMile}
          />
        </div>

        <div className="min-w-0 space-y-4">
          <CostPerMileCard cost={cost} revenuePerMile={summary.revenuePerMile} />
          <CostPerMileCard cost={basis} compact />
          <Card className="border-dashed">
            <CardContent className="space-y-2 p-4 text-2xs leading-relaxed text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Why two numbers.</span> The period
                figure is what this window actually cost to operate. Normalized Cost Per Mile is the stable number
                the load calculator prices new work on, so one annual bill landing inside a
                half-month does not make every quote wrong for two weeks.
              </p>
              <p>
                Debt Service is a separate cash burden. It is excluded from Actual and Normalized
                Cost Per Mile and never changes a load&apos;s profitability rating.
              </p>
              <p>
                Fixed and variable follow your own classification. Change it under{" "}
                <span className="text-foreground">Settings → Expense behaviour</span>.
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
}: {
  title: string;
  description: string;
  lines: CostLine[];
  totalMiles: number;
  total: number;
  perMile: number;
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
            Nothing in this group for the selected period.
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
                  <span className="truncate text-xs text-foreground">{line.label}</span>
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
            {formatPercent(lines.reduce((sum, l) => sum + l.share, 0))} of every dollar spent
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
