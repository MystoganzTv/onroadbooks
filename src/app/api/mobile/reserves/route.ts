import { NextResponse, type NextRequest } from "next/server";

import { getMobileSession } from "@/lib/auth/mobile";
import { summarizePeriod } from "@/lib/calculations";
import { getRepository } from "@/lib/db";
import { calculateSafeOwnerPay, resolveReserveRules } from "@/lib/finance/owner-pay";
import { calculateReserveBalances, totalReserved } from "@/lib/finance/reserves";
import { periodFromSearchParams } from "@/lib/period-params";
import { capabilityRefusal, planAllows } from "@/lib/plans";
import { FINANCIAL_MODEL_VERSION } from "@/lib/finance/terminology";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Am I saving enough?
 *
 * Reserves are a `cockpit` capability on the web, so they are one here too --
 * a phone is not a way around a plan gate. Balances, rules and safe-to-pay all
 * come from the same `lib/finance` functions `src/app/(app)/reserves/page.tsx`
 * calls, so a rate is applied in exactly one place.
 */
export async function GET(request: NextRequest) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const period = periodFromSearchParams(Object.fromEntries(request.nextUrl.searchParams));
  const dataset = await getRepository(session.businessId).getDataset();
  const { loads, expenses, settings, reserveAccounts, reserveTransactions, subscription } = dataset;

  if (!planAllows(subscription, "cockpit")) {
    return NextResponse.json({ error: capabilityRefusal("cockpit") }, { status: 403 });
  }

  const balances = calculateReserveBalances(reserveAccounts, reserveTransactions, period);
  const rules = resolveReserveRules(settings, reserveAccounts);
  const ownerPay = calculateSafeOwnerPay(
    summarizePeriod(loads, expenses, period, settings, dataset.paymentEvents),
    rules,
  );

  return NextResponse.json(
    {
      periodLabel: period.label,
      calculationVersion: FINANCIAL_MODEL_VERSION,
      total: totalReserved(balances),
      periodContributions: balances.reduce((sum, b) => sum + b.periodContributions, 0),
      periodWithdrawals: balances.reduce((sum, b) => sum + b.periodWithdrawals, 0),
      safeToPay: ownerPay.safeToPay,
      bookedRevenue: ownerPay.bookedRevenue,
      collectedRevenue: ownerPay.collectedRevenue,
      accountsReceivable: ownerPay.accountsReceivable,
      cashAfterDebtService: ownerPay.cashAfterDebtService,
      debtService: ownerPay.debtService,
      accounts: balances.map((entry) => {
        const rule = rules.find((r) => r.accountId === entry.account.id);
        return {
          id: entry.account.id,
          name: entry.account.name,
          balance: entry.balance,
          periodContributions: entry.periodContributions,
          periodWithdrawals: entry.periodWithdrawals,
          targetBalance: entry.account.targetBalance ?? null,
          // Percent of the target, or null when no target is set. Unlike the
          // money-flow bars, a target here is real, so a progress bar means
          // what it looks like.
          targetProgress: entry.targetProgress,
          rulePct: rule?.pct ?? null,
          ruleBasis: rule?.basis ?? null,
        };
      }),
      // The most recent movements across every account, so the screen can show
      // what actually happened rather than only where things stand.
      movements: balances
        .flatMap((entry) =>
          entry.transactions.map((transaction) => ({
            id: transaction.id,
            accountName: entry.account.name,
            date: transaction.date,
            amount: transaction.amount,
            description: transaction.description,
            // Movements a settlement close posted by itself read differently
            // from ones he entered by hand, so the app can say which is which.
            automatic: transaction.settlementId !== null,
          })),
        )
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .slice(0, 12),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
