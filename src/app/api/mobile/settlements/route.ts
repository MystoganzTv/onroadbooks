import { NextResponse, type NextRequest } from "next/server";

import { getMobileSession } from "@/lib/auth/mobile";
import { getRepository } from "@/lib/db";
import { calculateSettlement, settlementId, settlementWindows } from "@/lib/finance/settlement";
import { currentMonth, shiftMonth, todayISO } from "@/lib/periods";
import { financialModelVersionOf } from "@/lib/finance/terminology";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The last 6 half-month windows (3 months), same shape
 * `calculateSettlement` already produces for the web settlements page —
 * OPEN windows recompute live, CLOSED windows return the frozen snapshot.
 * Optional `?months=N` widens the lookback.
 */
export async function GET(request: NextRequest) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const monthsBack = Number(request.nextUrl.searchParams.get("months") ?? "3") || 3;
  const toMonth = currentMonth();
  const fromMonth = shiftMonth(toMonth, -(monthsBack - 1));

  const dataset = await getRepository(session.businessId).getDataset();
  const { loads, expenses, settings, reserveAccounts, settlements } = dataset;
  const today = todayISO();

  const windows = settlementWindows(fromMonth, toMonth);
  const views = windows.map(({ month, half }) => {
    const stored = settlements.find((s) => s.id === settlementId(month, half));
    return calculateSettlement(
      month,
      half,
      loads,
      expenses,
      settings,
      reserveAccounts,
      stored,
      today,
      dataset.paymentEvents,
    );
  });

  const results = views
    .filter((view) => view.status === "CLOSED" || view.figures.loadCount > 0)
    .map((view) => ({
      id: view.id,
      label: view.shortLabel,
      status: view.status,
      calculationVersion: financialModelVersionOf(view.figures),
      bookedRevenue: view.figures.bookedRevenue ?? view.figures.grossRevenue,
      collectedRevenue: view.figures.collectedRevenue ?? null,
      accountsReceivable: view.figures.accountsReceivable ?? null,
      unallocatedCollectedRevenue: view.figures.unallocatedCollectedRevenue ?? null,
      operatingProfit: view.figures.operatingProfit,
      interestExpense: view.figures.interestExpense ?? null,
      principalPayment: view.figures.principalPayment ?? null,
      unallocatedDebtService: view.figures.unallocatedDebtService ?? null,
      debtService: view.figures.debtService ?? null,
      cashAfterDebtService: view.figures.cashAfterDebtService ?? null,
      reserveTotal: view.figures.reserveTotal,
      safeToPay: view.figures.safeToPay,
      drifted: view.drifted,
    }));

  return NextResponse.json({ settlements: results }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
