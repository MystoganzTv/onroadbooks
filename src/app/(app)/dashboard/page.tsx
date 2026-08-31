import type { Metadata } from "next";
import Link from "next/link";
import { Calculator, Route } from "lucide-react";

import { RevenueExpenseChart } from "@/components/charts/revenue-expense-chart";
import { BestWorstLoads } from "@/components/cockpit/best-worst-loads";
import { BrokerPanel } from "@/components/cockpit/broker-panel";
import { CostPerMileCard } from "@/components/cockpit/cost-per-mile-card";
import { DeadheadMonitor } from "@/components/cockpit/deadhead-monitor";
import { EmptyCockpit } from "@/components/cockpit/empty-cockpit";
import { GoalProgressCard } from "@/components/cockpit/goal-progress-card";
import { HeroMetrics } from "@/components/cockpit/hero-metrics";
import { InsightsPanel } from "@/components/cockpit/insights-panel";
import { LanePanel } from "@/components/cockpit/lane-panel";
import { MoneyFlow } from "@/components/cockpit/money-flow";
import { ReservesPanel } from "@/components/cockpit/reserves-panel";
import { SafeToPayCard } from "@/components/cockpit/safe-to-pay-card";
import { Section } from "@/components/cockpit/section";
import { TodayCard } from "@/components/cockpit/today-card";
import { TruckHealthPanel } from "@/components/cockpit/truck-health-panel";
import { MiniStat } from "@/components/dashboard/mini-stat";
import { BookkeepingAlerts } from "@/components/dashboard/bookkeeping-alerts";
import { PeriodControls } from "@/components/dashboard/period-controls";
import { RecentLoads } from "@/components/dashboard/recent-loads";
import { ExpenseFormDialog } from "@/components/expenses/expense-form-dialog";
import { LoadFormDialog } from "@/components/loads/load-form-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { PlanGate } from "@/components/shared/plan-gate";
import { DashboardSubscriptionStatus } from "@/components/subscription/dashboard-subscription-status";
import { TruckSwitcher } from "@/components/fleet/truck-switcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import {
  categoryTotals,
  expensesInPeriod,
  loadsInPeriod,
  pctChange,
  summarizePeriod,
  thresholdsFromSettings,
  withMetricsAll,
} from "@/lib/calculations";
import { periodBuckets } from "@/lib/chart-data";
import { getRepository } from "@/lib/db";
import { hasFleetAccess, planAllows } from "@/lib/plans";
import {
  expensesForTruck,
  loadsForTruck,
  orderedTrucks,
  primaryTruck,
  truckById,
} from "@/lib/fleet";
import {
  bestAndWorst,
  buildCockpitInsights,
  calculateBrokerPerformance,
  calculateDaySnapshot,
  calculateDeadheadCost,
  calculateGoalProgress,
  calculateLanePerformance,
  calculateMaintenanceHealth,
  calculateProjection,
  calculateReserveBalances,
  calculateSafeOwnerPay,
  calculateTrueCostPerMile,
  LANE_MIN_LOADS,
  reserveBalanceFor,
  resolveReserveRules,
  scoreLoads,
} from "@/lib/finance";
import {
  formatMiles,
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  formatRateValue,
} from "@/lib/formatters";
import { thresholdsFrom } from "@/lib/maintenance";
import {
  periodFromSearchParams,
  scopeQuery,
  truckFromSearchParams,
  type SearchParams,
} from "@/lib/period-params";
import { defaultEntryDate, monthLabel, previousPeriod, todayISO } from "@/lib/periods";
import { recurringExpenseSuggestions } from "@/lib/recurring-expenses";
import { roleCan } from "@/lib/roles";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * THE COCKPIT
 * ===========
 *
 * Read top to bottom, this page answers, in order:
 *
 *   Am I making money?              the hero band
 *   How did today go?               the Today strip
 *   What does a mile cost, and am I on track?   business health
 *   Where did the money go?         the money flow
 *   Which loads were worth it?      load performance
 *   Who and where pays?             operations intelligence
 *   Am I saving enough?             reserves and truck health
 *   What changed?                   insights
 *
 * Every figure is recomputed from the rows dated inside the selected period.
 * Nothing is prorated, and no number on this page is calculated here -- the
 * page composes lib/finance, it does not do arithmetic.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const session = await requireSession();
  const dataset = await getRepository(session.businessId).getDataset();
  const period = periodFromSearchParams(params);
  const prior = previousPeriod(period);

  const {
    loads: allLoads,
    expenses: allExpenses,
    settings,
    goals,
    trucks,
    maintenanceRecords,
    reserveAccounts,
    reserveTransactions,
    drivers,
  } = dataset;

  // PeriodControls sends the browser's calendar date for "Today", so that
  // period is authoritative; otherwise fall back to the server's date.
  const today = period.key === "today" ? period.start : todayISO();

  // Scope. Null means the whole fleet; a truck id narrows every figure below
  // to that unit's own loads and its own direct costs.
  const truckId = truckFromSearchParams(params, trucks);
  const loads = truckId ? loadsForTruck(allLoads, truckId) : allLoads;
  const expenses = truckId ? expensesForTruck(allExpenses, truckId) : allExpenses;

  const ratingThresholds = thresholdsFromSettings(settings);
  const summary = summarizePeriod(loads, expenses, period, settings);
  const priorSummary = summarizePeriod(loads, expenses, prior, settings);

  const reserveRules = resolveReserveRules(settings, reserveAccounts);
  const ownerPay = calculateSafeOwnerPay(summary, reserveRules);

  // The cockpit is the decision layer. Without it the dashboard is still the
  // whole ledger -- revenue, profit, miles, what a mile cost, the chart and
  // the loads -- and the panels that answer "what should I do next" are
  // replaced by one panel that says where they live.
  const cockpit = planAllows(dataset.subscription, "cockpit");

  const periodLoads = scoreLoads(
    withMetricsAll(loadsInPeriod(loads, period), ratingThresholds),
    ratingThresholds,
    settings.deadheadWarnPct,
  );
  const periodExpenses = expensesInPeriod(expenses, period);
  const categories = categoryTotals(periodExpenses, settings);
  const monthlySuggestions = recurringExpenseSuggestions(dataset, period.month, truckId);

  const costBasis = calculateTrueCostPerMile(loads, expenses, period, settings, period.label);
  const deadhead = calculateDeadheadCost(summary, costBasis, settings, goals.maxDeadheadPct);
  const goalProgress = calculateGoalProgress(summary, goals, period);
  const projection = calculateProjection(summary, period, goals, today);
  const day = calculateDaySnapshot(loads, expenses, today, goals);

  const brokers = calculateBrokerPerformance(periodLoads, ratingThresholds);
  const lanes = calculateLanePerformance(periodLoads, ratingThresholds);
  const { best, worst } = bestAndWorst(periodLoads);

  const balances = calculateReserveBalances(reserveAccounts, reserveTransactions, period);
  const maintenanceReserve = reserveBalanceFor(balances, "MAINTENANCE");
  // Health is reported for one unit at a time, because "miles remaining" is a
  // fact about a specific odometer.
  const healthTruck = truckById(trucks, truckId) ?? primaryTruck(trucks);
  const maintenance = calculateMaintenanceHealth(
    maintenanceRecords.filter((record) => record.truckId === healthTruck.id),
    healthTruck,
    today,
    thresholdsFrom(settings),
    maintenanceReserve?.balance ?? 0,
  );

  const insights = buildCockpitInsights({
    period,
    summary,
    previous: priorSummary,
    previousLabel: prior.shortLabel,
    categories,
    costBasis,
    deadhead,
    ownerPay,
    goals,
    projection,
    brokers,
    lanes,
    maintenance,
  });

  const buckets = periodBuckets(loads, expenses, period);
  const query = scopeQuery(period, truckId);
  const brokerNames = [...new Set(loads.map((l) => l.broker).filter(Boolean))].sort() as string[];
  const settlementHref =
    period.key === "first" || period.key === "second"
      ? `/settlements?month=${period.month}&half=${period.key === "first" ? "FIRST" : "SECOND"}`
      : undefined;
  const hasLedgerHistory = allLoads.length > 0 || allExpenses.length > 0;

  const role = session.role ?? "VIEWER";
  const loadAction = roleCan(role, "manage_loads") ? (
    <LoadFormDialog
      brokers={brokerNames}
      trucks={trucks}
      drivers={hasFleetAccess(dataset.subscription) ? drivers : []}
      defaultTruckId={truckId}
      defaultDate={defaultEntryDate(period)}
      ratingThresholds={ratingThresholds}
    />
  ) : null;
  const expenseAction = roleCan(role, "manage_expenses") ? (
    <ExpenseFormDialog
      defaultDate={defaultEntryDate(period)}
      loads={periodLoads}
      trucks={trucks}
      defaultTruckId={truckId}
    />
  ) : null;
  const subscriptionStatus = (
    <DashboardSubscriptionStatus
      subscription={dataset.subscription}
      today={today}
      canManage={role === "OWNER"}
    />
  );

  if (!hasLedgerHistory) {
    return (
      <div className="space-y-5 p-4 lg:p-6">
        <PageHeader
          title="Business Overview"
          description="Revenue, costs, mileage, and cash available in one place."
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href="/calculator">
                <Calculator className="size-4" />
                Load calculator
              </Link>
            </Button>
          }
        />
        {subscriptionStatus}
        <EmptyCockpit
          businessName={dataset.business.name}
          loadAction={loadAction}
          expenseAction={expenseAction}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <PageHeader
        title="Business Overview"
        description="Revenue, costs, mileage, and cash available in one place."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/calculator">
                <Calculator className="size-4" />
                Load calculator
              </Link>
            </Button>
            {expenseAction}
            {loadAction}
          </>
        }
      />
      {subscriptionStatus}

      <div className="flex flex-wrap items-center gap-2">
        <PeriodControls period={period} />
        <TruckSwitcher trucks={orderedTrucks(trucks)} selectedId={truckId} />
      </div>

      <BookkeepingAlerts
        monthlyCount={monthlySuggestions.length}
        monthlyTotal={monthlySuggestions.reduce((total, expense) => total + expense.amount, 0)}
        month={period.month}
        monthLabel={monthLabel(period.month)}
        truckId={truckId}
      />

      {/* ---- The bottom line ------------------------------------------- */}
      <Section
        title="The bottom line"
        description={`${period.label} · ${summary.loadCount} ${summary.loadCount === 1 ? "load" : "loads"} · ${formatMiles(summary.totalMiles)}`}
      >
        <div className="grid gap-3 xl:grid-cols-3">
          <div className="min-w-0 xl:col-span-2">
            <HeroMetrics
              summary={summary}
              previous={priorSummary}
              ownerPay={cockpit ? ownerPay : undefined}
              previousLabel={prior.shortLabel}
              deltas={{
                revenue: pctChange(summary.grossRevenue, priorSummary.grossRevenue),
                profit: pctChange(summary.netProfit, priorSummary.netProfit),
                profitPerMile: pctChange(summary.profitPerMile, priorSummary.profitPerMile),
              }}
            />
          </div>
          {cockpit ? (
            <SafeToPayCard
              ownerPay={ownerPay}
              periodLabel={period.label}
              href={settlementHref}
              className="min-w-0"
            />
          ) : (
            <PlanGate
              capability="cockpit"
              what="Set aside tax and maintenance as each half-month closes, and see what is genuinely free to take out."
            />
          )}
        </div>
      </Section>

      {/* ---- Today ------------------------------------------------------ */}
      <TodayCard day={day} />

      {/* ---- Business health -------------------------------------------- */}
      <Section title="Business health" description="What a mile costs, and whether the pace holds">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MiniStat label="Total Miles" value={formatNumber(summary.totalMiles)} sub="mi" />
          <MiniStat label="Loaded Miles" value={formatNumber(summary.loadedMiles)} sub="mi" />
          <MiniStat
            label="Deadhead Miles"
            value={formatNumber(summary.deadheadMiles)}
            sub={formatPercent(summary.deadheadPct)}
            tone={deadhead.elevated ? "warning" : "neutral"}
          />
          <MiniStat
            label="True Cost / Mile"
            value={costBasis.sufficient ? formatRateValue(costBasis.trueCostPerMile) : "—"}
            sub="actual, not prorated"
            tone="negative"
          />
          <MiniStat
            label="Revenue / Mile"
            value={formatRateValue(summary.revenuePerMile)}
            sub="all miles"
            tone="info"
          />
          <MiniStat
            label="Loads Completed"
            value={formatNumber(summary.loadCount)}
            sub={`${formatMoneyCompact(summary.paidRevenue)} collected`}
            tone="neutral"
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <CostPerMileCard
            cost={costBasis}
            revenuePerMile={summary.revenuePerMile}
            href={`/analytics/cost-per-mile?${query}`}
            className="min-w-0"
          />
          {cockpit ? (
            <GoalProgressCard
              goals={goalProgress}
              projection={projection}
              periodLabel={period.label}
              className="min-w-0"
            />
          ) : null}
          <DeadheadMonitor report={deadhead} className="min-w-0" />
        </div>
      </Section>

      {/* ---- Money flow -------------------------------------------------- */}
      <Section title="Where the money went" description={period.label}>
        <div className="grid gap-3 xl:grid-cols-3">
          <MoneyFlow
            ownerPay={ownerPay}
            categories={categories}
            periodLabel={period.label}
            className="min-w-0 xl:col-span-2"
          />
          <Card className="min-w-0">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Route className="size-3.5 text-muted-foreground" />
                <CardTitle>Revenue vs Expenses</CardTitle>
              </div>
              <span className="text-2xs text-muted-foreground">
                {period.days > 62 ? "By month" : "By day"}
              </span>
            </CardHeader>
            <CardContent className="px-2 py-3">
              <RevenueExpenseChart data={buckets} />
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* ---- Load performance ------------------------------------------- */}
      <Section title="Load performance" description="The one to repeat, and the one to learn from">
        <BestWorstLoads
          best={best}
          worst={worst}
          periodQuery={query}
          periodLabel={period.label}
        />
        <RecentLoads loads={periodLoads.slice(0, 8)} />
      </Section>

      {/* ---- Operations intelligence ------------------------------------ */}
      {cockpit ? (
        <Section title="Operations intelligence" description="Who pays, and where">
          <div className="grid gap-3 lg:grid-cols-2">
            <BrokerPanel
              brokers={brokers}
              href={`/analytics/brokers?${query}`}
              className="min-w-0"
            />
            <LanePanel
              lanes={lanes}
              minLoads={LANE_MIN_LOADS}
              href={`/analytics/lanes?${query}`}
              className="min-w-0"
            />
          </div>
        </Section>
      ) : null}

      {/* ---- Reserves and the truck ------------------------------------- */}
      <Section title="Reserves and the truck" description="Am I setting enough aside">
        <div className="grid gap-3 lg:grid-cols-2">
          {cockpit ? (
            <ReservesPanel
              balances={balances}
              planned={ownerPay.reserves}
              periodLabel={period.label}
              className="min-w-0"
            />
          ) : null}
          <TruckHealthPanel health={maintenance} className="min-w-0" />
        </div>
      </Section>

      {/* ---- Insights ---------------------------------------------------- */}
      <Section title="Insights" description="Deterministic observations from this period's data">
        <InsightsPanel insights={insights} />
      </Section>
    </div>
  );
}
