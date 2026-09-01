import { NextResponse, type NextRequest } from "next/server";

import { getMobileSession } from "@/lib/auth/mobile";
import { getRepository } from "@/lib/db";
import {
  categoryTotals,
  expensesInPeriod,
  linkedFuelByLoad,
  loadsInPeriod,
  pctChange,
  thresholdsFromSettings,
  withMetricsAll,
} from "@/lib/calculations";
import {
  calculateDaySnapshot,
  calculateCashActivity,
  calculateFinancialPlanning,
  calculateReserveBalances,
  calculateTrueCostPerMile,
  trailingCostBasis,
  buildFinancialSummary,
  resolveReserveRules,
  scoreLoads,
} from "@/lib/finance";
import { FINANCIAL_MODEL_VERSION, isOperatingExpense } from "@/lib/finance/terminology";
import { periodFromSearchParams } from "@/lib/period-params";
import { previousPeriod, todayISO } from "@/lib/periods";

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

  const period = periodFromSearchParams(Object.fromEntries(request.nextUrl.searchParams));
  const prior = previousPeriod(period);
  const today = todayISO();

  const dataset = await getRepository(session.businessId).getDataset();
  const { loads, expenses, settings, goals, reserveAccounts, reserveTransactions, fuelEntries, paymentEvents, financialObligations } = dataset;

  const thresholds = thresholdsFromSettings(settings);
  const summary = buildFinancialSummary(loads, expenses, paymentEvents, period, settings, reserveAccounts);
  const priorSummary = buildFinancialSummary(loads, expenses, paymentEvents, prior, settings, reserveAccounts);

  const reserveRules = resolveReserveRules(settings, reserveAccounts);
  const ownerPay = summary;
  const costBasis = calculateTrueCostPerMile(loads, expenses, period, settings, period.label);
  const balances = calculateReserveBalances(reserveAccounts, reserveTransactions, period);

  const periodLoads = scoreLoads(
    withMetricsAll(loadsInPeriod(loads, period), thresholds, linkedFuelByLoad(fuelEntries)),
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
  const planning = calculateFinancialPlanning(
    goals,
    trailingCostBasis(loads, expenses, settings, today),
    financialObligations,
  );

  const recentLoads = [...periodLoads]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 8)
    .map((load) => ({
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
      contributionProfitPerMile: load.metrics.profitPerMile,
      profitPerMile: load.metrics.profitPerMile,
      rating: load.metrics.rating,
    }));

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
      safeToPay: ownerPay.safeToPay,
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
      planning,
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
