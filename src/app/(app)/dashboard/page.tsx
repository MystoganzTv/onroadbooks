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
import { Section } from "@/components/cockpit/section";
import { TodayCard } from "@/components/cockpit/today-card";
import { TodayCashCard } from "@/components/cockpit/today-cash-card";
import { PlanningCard } from "@/components/cockpit/planning-card";
import { TruckHealthPanel } from "@/components/cockpit/truck-health-panel";
import { MiniStat } from "@/components/dashboard/mini-stat";
import { BookkeepingAlerts } from "@/components/dashboard/bookkeeping-alerts";
import { PeriodControls } from "@/components/dashboard/period-controls";
import { RecentLoads } from "@/components/dashboard/recent-loads";
import { ExpenseFormDialog } from "@/components/expenses/expense-form-dialog";
import { LoadFormDialog } from "@/components/loads/load-form-dialog";
import { PageHeader } from "@/components/shared/page-header";
import {
  ActionableProblemBanner,
  ActionableProblemList,
} from "@/components/shared/actionable-problem";
import { PlanGate } from "@/components/shared/plan-gate";
import { DashboardSubscriptionStatus } from "@/components/subscription/dashboard-subscription-status";
import { TruckSwitcher } from "@/components/fleet/truck-switcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import {
  linkedFuelByLoad,
  categoryTotals,
  expensesInPeriod,
  loadsInPeriod,
  pctChange,
  thresholdsFromSettings,
  withMetricsAll,
} from "@/lib/calculations";
import { periodBuckets } from "@/lib/chart-data";
import { getRepository } from "@/lib/db";
import { driverScheduleFromLoads } from "@/lib/driver-availability";
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
  buildFinancialSummary,
  calculateDaySnapshot,
  calculateDeadheadCost,
  calculateGoalProgress,
  calculateLanePerformance,
  calculateMaintenanceHealth,
  calculateProjection,
  calculateReserveBalances,
  calculateTrueCostPerMile,
  calculateCashActivity,
  calculateFinancialPlanning,
  trailingCostBasis,
  LANE_MIN_LOADS,
  reserveBalanceFor,
  scoreLoads,
  selectActionableFinancialProblems,
  selectOwnerMoneyPresentation,
} from "@/lib/finance";
import type { ActionableProblem } from "@/lib/finance/presentation";
import {
  formatMiles,
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  formatRateValue,
} from "@/lib/formatters";
import { thresholdsFrom } from "@/lib/maintenance";
import { isOperatingExpense } from "@/lib/finance/terminology";
import {
  periodFromSearchParams,
  scopeQuery,
  truckFromSearchParams,
  type SearchParams,
} from "@/lib/period-params";
import { defaultEntryDate, monthLabel, previousPeriod, todayISO, type Period } from "@/lib/periods";
import { recurringExpenseSuggestions } from "@/lib/recurring-expenses";
import { roleCan } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { appText } from "@/lib/i18n";
import { getAppLocale } from "@/lib/i18n-server";

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
  const [session, locale] = await Promise.all([requireSession(), getAppLocale()]);
  const tx = (english: string, spanish: string) => appText(locale, english, spanish);
  const role = session.role ?? "VIEWER";
  const ownerPlanning = roleCan(role, "manage_owner_finances");
  const dataset = await getRepository(session.businessId).getDataset();
  const period = periodFromSearchParams(params);
  const periodDisplayLabel = localizedPeriodLabel(period, locale);
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
    paymentEvents,
    financialObligations,
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
  const summary = buildFinancialSummary(
    loads,
    expenses,
    paymentEvents,
    period,
    settings,
    reserveAccounts,
  );
  const priorSummary = buildFinancialSummary(
    loads,
    expenses,
    paymentEvents,
    prior,
    settings,
    reserveAccounts,
  );

  const ownerPay = summary;

  // The cockpit is the decision layer. Without it the dashboard is still the
  // whole ledger -- revenue, profit, miles, what a mile cost, the chart and
  // the loads -- and the panels that answer "what should I do next" are
  // replaced by one panel that says where they live.
  const cockpit = planAllows(dataset.subscription, "cockpit");

  const periodLoads = scoreLoads(
    withMetricsAll(loadsInPeriod(loads, period), ratingThresholds, linkedFuelByLoad(dataset.fuelEntries)),
    ratingThresholds,
    settings.deadheadWarnPct,
  );
  const loadsWithPaymentEvents = new Set(paymentEvents.map((event) => event.loadId));
  const missingPaymentDateCount = periodLoads.filter(
    (load) =>
      load.status === "PAID" &&
      !load.invoicePaidDate &&
      !loadsWithPaymentEvents.has(load.id),
  ).length;
  const periodExpenses = expensesInPeriod(expenses, period);
  const categories = categoryTotals(periodExpenses.filter(isOperatingExpense), settings);
  // Split by whether the cost's date has arrived. What is due but still
  // missing is a real gap in the books; what is merely dated later this month
  // is not late, it is scheduled -- the nightly job posts it on its day.
  const monthlySuggestions = recurringExpenseSuggestions(dataset, period.month, truckId);
  const monthlyDue = monthlySuggestions.filter((suggestion) => suggestion.date <= today);
  const monthlyScheduled = monthlySuggestions.filter((suggestion) => suggestion.date > today);

  const costBasis = calculateTrueCostPerMile(loads, expenses, period, settings, period.label);
  const deadhead = calculateDeadheadCost(summary, costBasis, settings, goals.maxDeadheadPct);
  const goalProgress = calculateGoalProgress(summary, goals, period);
  const projection = calculateProjection(summary, period, goals, today);
  const day = calculateDaySnapshot(loads, expenses, today, goals);
  const cashToday = calculateCashActivity(loads, expenses, paymentEvents, {
    start: today,
    end: today,
  });
  const planning = calculateFinancialPlanning(
    goals,
    trailingCostBasis(loads, expenses, settings, today),
    truckId
      ? financialObligations.filter((obligation) => obligation.truckId === truckId)
      : financialObligations,
  );

  const brokers = calculateBrokerPerformance(periodLoads, ratingThresholds);
  const lanes = calculateLanePerformance(periodLoads, ratingThresholds);
  const { best, worst } = bestAndWorst(periodLoads);

  const balances = ownerPlanning
    ? calculateReserveBalances(reserveAccounts, reserveTransactions, period)
    : [];
  const reserveFundingGap = balances.reduce((gap, balance) => {
    const target = balance.account.targetBalance ?? 0;
    return gap + Math.max(target - balance.balance, 0);
  }, 0);
  const moneyPresentation = selectOwnerMoneyPresentation({
    ...summary,
    reserveTotal: cockpit && ownerPlanning ? summary.reserveTotal : null,
    safeToPay: cockpit && ownerPlanning ? summary.safeToPay : null,
  });
  const actionableProblems = selectActionableFinancialProblems({
    unallocatedCollectedRevenue: summary.unallocatedCollectedRevenue,
    missingPaymentDateCount,
    unallocatedDebtService: ownerPlanning ? summary.unallocatedDebtService : 0,
    reserveFundingGap: cockpit && ownerPlanning ? reserveFundingGap : 0,
  });
  const displayedProblems = locale === "es"
    ? actionableProblems.map(localizeActionableProblem)
    : actionableProblems;
  const paymentDateProblem = displayedProblems.find((problem) => problem.id === "payment-dates");
  const secondaryProblems = displayedProblems.filter((problem) => problem.id !== "payment-dates");
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
    includeOwnerPlanning: ownerPlanning,
  });

  const buckets = periodBuckets(loads, expenses, period);
  const query = scopeQuery(period, truckId);
  const brokerNames = [...new Set(loads.map((l) => l.broker).filter(Boolean))].sort() as string[];
  const hasLedgerHistory = allLoads.length > 0 || allExpenses.length > 0;

  const loadAction = roleCan(role, "manage_loads") ? (
    <LoadFormDialog
      brokers={brokerNames}
      trucks={trucks}
      drivers={hasFleetAccess(dataset.subscription) ? drivers : []}
      driverSchedule={driverScheduleFromLoads(allLoads)}
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
      locale={locale}
    />
  );

  if (!hasLedgerHistory) {
    return (
      <div className="space-y-5 p-4 lg:p-6">
        <PageHeader
          title={tx("Business Overview", "Resumen del negocio")}
          description={tx(
            "Revenue, costs, mileage, and cash available in one place.",
            "Ingresos, gastos, millas y efectivo disponible en un solo lugar.",
          )}
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href="/calculator">
                <Calculator className="size-4" />
                {tx("Load calculator", "Calculadora de cargas")}
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
        title={tx("Business Overview", "Resumen del negocio")}
        description={tx(
          "Revenue, costs, mileage, and cash available in one place.",
          "Ingresos, gastos, millas y efectivo disponible en un solo lugar.",
        )}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/calculator">
                <Calculator className="size-4" />
                {tx("Load calculator", "Calculadora de cargas")}
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

      {paymentDateProblem ? <ActionableProblemBanner problem={paymentDateProblem} /> : null}

      {/* ---- The bottom line ------------------------------------------- */}
      <Section
        title={tx("The bottom line", "El resultado")}
        description={`${periodDisplayLabel} · ${summary.loadCount} ${summary.loadCount === 1 ? tx("load", "carga") : tx("loads", "cargas")} · ${formatMiles(summary.totalMiles)}`}
      >
        <HeroMetrics
          summary={summary}
          presentation={moneyPresentation}
          previousLabel={prior.shortLabel}
          deltas={{
            revenue: pctChange(summary.bookedRevenue, priorSummary.bookedRevenue),
            profit: pctChange(summary.operatingProfit, priorSummary.operatingProfit),
            profitPerMile: pctChange(summary.profitPerMile, priorSummary.profitPerMile),
          }}
          showOwnerPlanning={ownerPlanning}
          locale={locale}
        />
        {ownerPlanning && !cockpit ? (
          <PlanGate
            capability="cockpit"
            what="Set aside tax and maintenance as each half-month closes, and see what is genuinely free to take out."
          />
        ) : null}
      </Section>

      <BookkeepingAlerts
        dueCount={monthlyDue.length}
        dueTotal={monthlyDue.reduce((total, expense) => total + expense.amount, 0)}
        scheduledCount={monthlyScheduled.length}
        scheduledTotal={monthlyScheduled.reduce((total, expense) => total + expense.amount, 0)}
        month={period.month}
        monthLabel={locale === "es" ? localizedMonthName(period.month) : monthLabel(period.month)}
        truckId={truckId}
      />
      <ActionableProblemList problems={secondaryProblems} />

      {/* ---- Today ------------------------------------------------------ */}
      <div className="grid gap-3 xl:grid-cols-2">
        <TodayCard day={day} />
        <TodayCashCard cash={cashToday} />
      </div>

      {/* ---- Business health -------------------------------------------- */}
      <Section
        title={tx("Business health", "Salud del negocio")}
        description={tx("What a mile costs, and whether the pace holds", "Cuánto cuesta cada milla y si el ritmo es sostenible")}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MiniStat label={tx("Total Miles", "Millas totales")} value={formatNumber(summary.totalMiles)} sub="mi" />
          <MiniStat label={tx("Loaded Miles", "Millas cargadas")} value={formatNumber(summary.loadedMiles)} sub="mi" />
          <MiniStat
            label={tx("Deadhead Miles", "Millas vacías")}
            value={formatNumber(summary.deadheadMiles)}
            sub={formatPercent(summary.deadheadPct)}
            tone={deadhead.elevated ? "warning" : "neutral"}
          />
          <MiniStat
            label={tx("Actual Cost / Mile", "Costo real / milla")}
            value={costBasis.sufficient ? formatRateValue(costBasis.trueCostPerMile) : "—"}
            sub={tx("actual, not prorated", "real, no prorrateado")}
            tone="negative"
          />
          <MiniStat
            label={tx("Revenue / Mile", "Ingreso / milla")}
            value={formatRateValue(summary.revenuePerMile)}
            sub={tx("all miles", "todas las millas")}
            tone="info"
          />
          <MiniStat
            label={tx("Loads Completed", "Cargas completadas")}
            value={formatNumber(summary.loadCount)}
            sub={`${formatMoneyCompact(summary.collectedRevenue)} ${tx("collected", "cobrado")}`}
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
              periodLabel={periodDisplayLabel}
              className="min-w-0"
            />
          ) : null}
          <DeadheadMonitor report={deadhead} className="min-w-0" />
          {cockpit ? <PlanningCard planning={planning} /> : null}
        </div>
      </Section>

      {/* ---- Money flow -------------------------------------------------- */}
      <Section title={tx("Where the money went", "A dónde se fue el dinero")} description={periodDisplayLabel}>
        <div className="grid gap-3 xl:grid-cols-3">
          <MoneyFlow
            ownerPay={ownerPay}
            categories={categories}
            periodLabel={periodDisplayLabel}
            showOwnerPlanning={ownerPlanning}
            locale={locale}
            className="min-w-0 xl:col-span-2"
          />
          <Card className="min-w-0">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Route className="size-3.5 text-muted-foreground" />
                <CardTitle>{tx("You Earned vs Business Expenses", "Lo que ganaste vs gastos del negocio")}</CardTitle>
              </div>
              <span className="text-2xs text-muted-foreground">
                {period.days > 62 ? tx("By month", "Por mes") : tx("By day", "Por día")}
              </span>
            </CardHeader>
            <CardContent className="px-2 py-3">
              <RevenueExpenseChart data={buckets} />
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* ---- Load performance ------------------------------------------- */}
      <Section
        title={tx("Load performance", "Rendimiento de cargas")}
        description={tx("The one to repeat, and the one to learn from", "La que conviene repetir y la que deja una lección")}
      >
        <BestWorstLoads
          best={best}
          worst={worst}
          periodQuery={query}
          periodLabel={periodDisplayLabel}
        />
        <RecentLoads loads={periodLoads.slice(0, 8)} />
      </Section>

      {/* ---- Operations intelligence ------------------------------------ */}
      {cockpit ? (
        <Section title={tx("Operations intelligence", "Análisis operativo")} description={tx("Who pays, and where", "Quién paga y dónde")}>
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
      <Section
        title={ownerPlanning ? tx("Reserves and the truck", "Reservas y camión") : tx("Truck condition", "Estado del camión")}
        description={ownerPlanning ? tx("Am I setting enough aside", "¿Estoy reservando lo suficiente?") : tx("Maintenance due and upcoming cost", "Mantenimiento pendiente y próximos costos")}
      >
        <div className="grid gap-3 lg:grid-cols-2">
          {cockpit && ownerPlanning ? (
            <ReservesPanel
              balances={balances}
              planned={ownerPay.reserves}
              periodLabel={periodDisplayLabel}
              className="min-w-0"
            />
          ) : null}
          <TruckHealthPanel
            health={maintenance}
            showReserve={ownerPlanning}
            className={cn("min-w-0", !ownerPlanning && "lg:col-span-2")}
          />
        </div>
      </Section>

      {/* ---- Insights ---------------------------------------------------- */}
      <Section
        title={tx("Insights", "Observaciones")}
        description={tx("Deterministic observations from this period's data", "Conclusiones directas de los datos de este período")}
      >
        <InsightsPanel insights={insights} />
      </Section>
    </div>
  );
}

function localizedPeriodLabel(period: Period, locale: "en" | "es"): string {
  if (locale === "en") return period.label;
  const [year, month] = period.month.split("-").map(Number);
  const monthYear = new Intl.DateTimeFormat("es-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(new Date(Date.UTC(year, month - 1, 1)))
    .replace(/^./, (character) => character.toUpperCase());
  if (period.key === "first") return `1–15 de ${monthYear}`;
  if (period.key === "second") return `16–fin de ${monthYear}`;
  if (period.key === "quarter") return `Trimestre de ${monthYear}`;
  if (period.key === "ytd") return `${year} hasta hoy`;
  if (period.key === "today") return `Hoy · ${period.start}`;
  if (period.key === "week") return `Esta semana · ${period.start}–${period.end}`;
  if (period.key === "custom") return `${period.start}–${period.end}`;
  return monthYear;
}

function localizedMonthName(monthValue: string): string {
  const [year, month] = monthValue.split("-").map(Number);
  return new Intl.DateTimeFormat("es-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(new Date(Date.UTC(year, month - 1, 1)))
    .replace(/^./, (character) => character.toUpperCase());
}

function localizeActionableProblem(problem: ActionableProblem): ActionableProblem {
  const count = problem.count ?? 0;
  const copy: Record<ActionableProblem["id"], Pick<ActionableProblem, "headline" | "what" | "why"> & { actionLabel: string }> = {
    "payment-dates": {
      headline: "Pendiente de registrar",
      what: count > 0
        ? `Agrega las fechas de pago de ${count} ${count === 1 ? "carga pagada" : "cargas pagadas"}.`
        : "Estas cargas aparecen pagadas, pero OnRoad no sabe cuándo llegó el efectivo.",
      why: "OnRoad necesita las fechas antes de incluir este dinero en tu efectivo.",
      actionLabel: "Corregir ahora",
    },
    "unclassified-debt": {
      headline: "Pagos de deuda sin clasificar",
      what: "Algunos pagos no están divididos entre intereses y principal.",
      why: "El efectivo que salió se conoce, pero los reportes no pueden explicar el costo financiero.",
      actionLabel: "Clasificar deuda",
    },
    "missing-fuel-details": {
      headline: "Faltan detalles de combustible",
      what: "El costo de combustible proviene de estimados y no de cargas reales en la bomba.",
      why: "El MPG, precio por galón e información de IFTA permanecen incompletos.",
      actionLabel: "Agregar combustible",
    },
    "missing-broker-customer": {
      headline: "Falta broker o cliente",
      what: "Algunas cargas no identifican quién debe el dinero.",
      why: "Sin pagador no se pueden seguir correctamente los cobros ni el rendimiento del cliente.",
      actionLabel: "Completar clientes",
    },
    "missing-invoice": {
      headline: "Faltan facturas",
      what: "Algunas cargas completadas todavía no se han facturado.",
      why: "El cliente no puede pagar una factura que aún no se ha emitido.",
      actionLabel: "Crear facturas",
    },
    "missing-ifta-records": {
      headline: "Faltan millas para IFTA",
      what: "Algunos viajes no tienen las millas por jurisdicción necesarias para IFTA.",
      why: "El reporte trimestral seguirá incompleto hasta revisar esos viajes.",
      actionLabel: "Completar millas IFTA",
    },
    "reserve-funding-gap": {
      headline: "Reservas por debajo de la meta",
      what: "Los saldos de reserva están por debajo de las metas configuradas para el negocio.",
      why: "Hay menos dinero protegido para impuestos, mantenimiento o emergencias de lo planificado.",
      actionLabel: "Financiar reservas",
    },
  };
  const localized = copy[problem.id];
  return {
    ...problem,
    headline: localized.headline,
    what: localized.what,
    why: localized.why,
    action: { ...problem.action, label: localized.actionLabel },
  };
}
