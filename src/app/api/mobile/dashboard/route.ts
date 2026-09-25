import { buildLoadEstimator } from "@/lib/load-estimates";
import { NextResponse, type NextRequest } from "next/server";
import { operatingLedger } from "@/lib/startup-costs";

import { getMobileSession } from "@/lib/auth/mobile";
import { getRepository } from "@/lib/db";
import {
  categoryTotals,
  expensesInPeriod,
  loadsInPeriod,
  pctChange,
  roundMoney,
  thresholdsFromSettings,
  withMetricsAll,
} from "@/lib/calculations";
import {
  calculateDaySnapshot,
  calculateCashActivity,
  calculateFinancialPlanning,
  calculateReserveBalances,
  calculateTrueCostPerMile,
  overheadCostPerMile,
  trailingCostBasis,
  buildFinancialSummary,
  resolveReserveRules,
  scoreLoads,
} from "@/lib/finance";
import { FINANCIAL_MODEL_VERSION, isOperatingExpense } from "@/lib/finance/terminology";
import { periodFromSearchParams } from "@/lib/period-params";
import { previousPeriod, todayISO } from "@/lib/periods";
import { planAllows } from "@/lib/plans";
import { roleCan } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The cockpit, condensed for a phone screen. Reuses exactly the functions
 * `src/app/(app)/dashboard/page.tsx` calls (see its header comment for the
 * reading order this mirrors) so every rule — costsPosted, reserve math,
 * Actual Cost Per Mile — is enforced in that ONE place, not reimplemented
 * here. This route only selects which of those already-correct numbers a
 * phone needs and shapes them as JSON.
 *
 * Query params match the web app's: ?month=2026-08&period=full
 */
export async function GET(request: NextRequest) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ownerPlanning = roleCan(session.role ?? "VIEWER", "manage_owner_finances");

  const period = periodFromSearchParams(Object.fromEntries(request.nextUrl.searchParams));
  const prior = previousPeriod(period);
  const today = todayISO();

  const dataset = await getRepository(session.businessId).getDataset();
  const { loads, expenses: ledgerExpenses, settings, goals, reserveAccounts, reserveTransactions, paymentEvents, financialObligations } = dataset;

  // Operating results start at the first load, exactly as on the web dashboard.
  const expenses = operatingLedger(loads, ledgerExpenses);

  // The web dashboard guards owner planning with `cockpit && ownerPlanning`
  // (see the dashboard page). Role alone would hand a Solo account the
  // reserves, Safe to Pay and the projection.
  const cockpit = planAllows(dataset.subscription, "cockpit");
  const ownerCockpit = cockpit && ownerPlanning;

  const thresholds = thresholdsFromSettings(settings);
  const ownerReserveAccounts = ownerCockpit ? reserveAccounts : [];
  const summary = buildFinancialSummary(
    loads,
    expenses,
    paymentEvents,
    period,
    settings,
    ownerReserveAccounts,
  );
  const priorSummary = buildFinancialSummary(
    loads,
    expenses,
    paymentEvents,
    prior,
    settings,
    ownerReserveAccounts,
  );

  const reserveRules = ownerCockpit ? resolveReserveRules(settings, reserveAccounts) : [];
  const ownerPay = summary;
  const costBasis = calculateTrueCostPerMile(loads, expenses, period, settings, period.label);
  const balances = ownerCockpit
    ? calculateReserveBalances(reserveAccounts, reserveTransactions, period)
    : [];

  const periodLoads = scoreLoads(
    withMetricsAll(loadsInPeriod(loads, period), thresholds, expenses, buildLoadEstimator(dataset, today)),
    thresholds,
    settings.deadheadWarnPct,
  );
  const categories = categoryTotals(
    expensesInPeriod(expenses, period).filter((expense) =>
      isOperatingExpense(expense),
    ),
    settings,
  );
  const day = calculateDaySnapshot(loads, expenses, today, goals);
  const cashToday = calculateCashActivity(loads, expenses, paymentEvents, { start: today, end: today });
  // The same trailing basis /api/mobile/loads allocates with. Computed once
  // here and shared with `recentLoads` below so a load cannot show one
  // contribution on the dashboard and a different one on the Loads tab.
  const tripCostBasis = trailingCostBasis(loads, expenses, settings, today);
  const allocatedOperatingCostPerMile = overheadCostPerMile(tripCostBasis);
  const planning = calculateFinancialPlanning(goals, tripCostBasis, financialObligations);

  const recentLoads = [...periodLoads]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 8)
    .map((load) => {
      const allocatedOperatingCosts = roundMoney(
        load.metrics.totalMiles * allocatedOperatingCostPerMile,
      );
      // This is one load in the phone's LoadDTO, which /api/mobile/loads
      // already satisfies in full. It is a single decoder on the client, so a
      // shorter shape here is not a smaller card -- it is a decode failure
      // that empties the whole dashboard. Keep the two routes identical.
      return {
        id: load.id,
        date: load.date,
        broker: load.broker,
        originCity: load.originCity,
        originState: load.originState,
        destinationCity: load.destinationCity,
        destinationState: load.destinationState,
        grossRate: load.grossRate,
        loadedMiles: load.loadedMiles,
        deadheadMiles: load.deadheadMiles,
        directTripCosts: load.metrics.tripExpenses,
        contributionProfit: load.metrics.tripProfit,
        contributionProfitPerMile: load.metrics.profitPerMile,
        contributionMargin: load.metrics.profitMargin,
        allocatedOperatingCosts,
        estimatedFullyLoadedOperatingProfit: roundMoney(
          load.metrics.tripProfit - allocatedOperatingCosts,
        ),
        debtCashBurden: roundMoney(load.metrics.totalMiles * tripCostBasis.debtServicePerMile),
        allocationBasisLabel: tripCostBasis.basisLabel,
        // Read-compatible aliases for older mobile builds.
        profitPerMile: load.metrics.profitPerMile,
        profitMargin: load.metrics.profitMargin,
        deadheadPct: load.metrics.deadheadPct,
        rating: load.metrics.rating,
      };
    });

  return NextResponse.json(
    {
      periodLabel: period.label,
      calculationVersion: FINANCIAL_MODEL_VERSION,
      month: period.month,
      bookedRevenue: summary.bookedRevenue,
      collectedRevenue: summary.collectedRevenue,
      accountsReceivable: summary.accountsReceivable,
      unallocatedCollectedRevenue: summary.unallocatedCollectedRevenue,
      operatingExpenses: summary.operatingExpenses,
      operatingProfit: summary.operatingProfit,
      interestExpense: summary.interestExpense,
      principalPayment: summary.principalPayment,
      unallocatedDebtService: summary.unallocatedDebtService,
      debtService: summary.debtService,
      cashAfterDebtService: summary.cashAfterDebtService,
      bookedRevenueDeltaPct: pctChange(summary.bookedRevenue, priorSummary.bookedRevenue),
      operatingProfitDeltaPct: pctChange(summary.operatingProfit, priorSummary.operatingProfit),
      actualCostPerMile: costBasis.actualCostPerMile,
      debtServicePerMile: costBasis.debtServicePerMile,
      // Read-compatible aliases for older mobile builds.
      revenue: summary.bookedRevenue,
      expenses: summary.operatingExpenses,
      netProfit: summary.operatingProfit,
      revenueDeltaPct: pctChange(summary.bookedRevenue, priorSummary.bookedRevenue),
      netProfitDeltaPct: pctChange(summary.operatingProfit, priorSummary.operatingProfit),
      trueCostPerMile: costBasis.actualCostPerMile,
      safeToPay: ownerCockpit ? ownerPay.safeToPay : null,
      totalMiles: summary.totalMiles,
      deadheadPct: summary.deadheadPct,
      today: {
        bookedRevenue: day.revenue,
        operatingExpenses: day.expenses,
        operatingProfit: day.profit,
        operatingProfitPerMile: day.profitPerMile,
        // Compatibility alias.
        revenue: day.revenue,
        loadCount: day.loadCount,
        cashActivity: cashToday,
      },
      planning: cockpit ? planning : null,
      expenseBreakdown: categories.map((c) => ({
        category: c.category,
        label: c.label,
        amount: c.amount,
      })),
      recentLoads,
      reserves: balances.map((b) => ({
        id: b.account.id,
        name: b.account.name,
        contributionPct: reserveRules.find((r) => r.accountId === b.account.id)?.pct ?? null,
        balance: b.balance,
      })),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
