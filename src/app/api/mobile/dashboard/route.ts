import { NextResponse, type NextRequest } from "next/server";

import { getMobileSession } from "@/lib/auth/mobile";
import { getRepository } from "@/lib/db";
import {
  categoryTotals,
  expensesInPeriod,
  linkedFuelByLoad,
  loadsInPeriod,
  pctChange,
  summarizePeriod,
  thresholdsFromSettings,
  withMetricsAll,
} from "@/lib/calculations";
import {
  calculateDaySnapshot,
  calculateReserveBalances,
  calculateSafeOwnerPay,
  calculateTrueCostPerMile,
  resolveReserveRules,
  scoreLoads,
} from "@/lib/finance";
import { periodFromSearchParams } from "@/lib/period-params";
import { previousPeriod, todayISO } from "@/lib/periods";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The cockpit, condensed for a phone screen. Reuses exactly the functions
 * `src/app/(app)/dashboard/page.tsx` calls (see its header comment for the
 * reading order this mirrors) so every rule — costsPosted, reserve math,
 * true cost per mile — is enforced in that ONE place, not reimplemented
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
  const { loads, expenses, settings, goals, reserveAccounts, reserveTransactions, fuelEntries } = dataset;

  const thresholds = thresholdsFromSettings(settings);
  const summary = summarizePeriod(loads, expenses, period, settings);
  const priorSummary = summarizePeriod(loads, expenses, prior, settings);

  const reserveRules = resolveReserveRules(settings, reserveAccounts);
  const ownerPay = calculateSafeOwnerPay(summary, reserveRules);
  const costBasis = calculateTrueCostPerMile(loads, expenses, period, settings, period.label);
  const balances = calculateReserveBalances(reserveAccounts, reserveTransactions, period);

  const periodLoads = scoreLoads(
    withMetricsAll(loadsInPeriod(loads, period), thresholds, linkedFuelByLoad(fuelEntries)),
    thresholds,
    settings.deadheadWarnPct,
  );
  const categories = categoryTotals(expensesInPeriod(expenses, period), settings);
  const day = calculateDaySnapshot(loads, expenses, today, goals);

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
      profitPerMile: load.metrics.profitPerMile,
      rating: load.metrics.rating,
    }));

  return NextResponse.json(
    {
      periodLabel: period.label,
      month: period.month,
      revenue: summary.grossRevenue,
      expenses: summary.operatingExpenses,
      netProfit: summary.netProfit,
      revenueDeltaPct: pctChange(summary.grossRevenue, priorSummary.grossRevenue),
      netProfitDeltaPct: pctChange(summary.netProfit, priorSummary.netProfit),
      trueCostPerMile: costBasis.trueCostPerMile,
      safeToPay: ownerPay.safeToPay,
      totalMiles: summary.totalMiles,
      deadheadPct: summary.deadheadPct,
      today: { revenue: day.revenue, loadCount: day.loadCount },
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
