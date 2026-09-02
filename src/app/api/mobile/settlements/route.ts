import { NextResponse, type NextRequest } from "next/server";

import { getMobileSession, requireMobileWrite } from "@/lib/auth/mobile";
import { getRepository } from "@/lib/db";
import {
  calculateSettlement,
  planSettlementClose,
  settlementId,
  settlementWindows,
} from "@/lib/finance/settlement";
import { currentMonth, shiftMonth, todayISO } from "@/lib/periods";
import { settlementRefSchema } from "@/lib/schemas";
import { revalidatePath } from "next/cache";
import { financialModelVersionOf } from "@/lib/finance/terminology";
import { capabilityRefusal, planAllows } from "@/lib/plans";
import { roleCan } from "@/lib/roles";

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
  if (!roleCan(session.role ?? "VIEWER", "manage_owner_finances")) {
    return NextResponse.json({ error: "Owner access required." }, { status: 403 });
  }

  const monthsBack = Number(request.nextUrl.searchParams.get("months") ?? "3") || 3;
  const toMonth = currentMonth();
  const fromMonth = shiftMonth(toMonth, -(monthsBack - 1));

  const dataset = await getRepository(session.businessId).getDataset();
  // Settlements are a `cockpit` capability on the web (see the settlements
  // page), so they are one here too. Role alone is not the gate: on a
  // single-user account the sole user IS the owner.
  if (!planAllows(dataset.subscription, "cockpit")) {
    return NextResponse.json({ error: capabilityRefusal("cockpit") }, { status: 403 });
  }
  const { loads, expenses, settings, reserveAccounts, settlements } = dataset;
  const today = todayISO();

  const windows = settlementWindows(fromMonth, toMonth);
  const refs = new Map<string, { month: string; half: (typeof windows)[number]["half"] }>();
  const views = windows.map(({ month, half }) => {
    refs.set(settlementId(month, half), { month, half });
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
      // What `PATCH` needs to close or reopen this window. The id is opaque
      // on purpose; the phone should not be parsing it.
      month: refs.get(view.id)?.month ?? null,
      half: refs.get(view.id)?.half ?? null,
      closable: view.status === "OPEN" && todayISO() > view.range.end,
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

/**
 * Close or reopen a half-month from the phone.
 *
 * Closing is the ritual the whole product is built around, and it was the one
 * thing the owner had to find a laptop for. What closing MEANS is decided by
 * `planSettlementClose` — the same function the web action calls — so the
 * snapshot is built server-side from the rows as they stand, and the reserve
 * contributions posted against it are identical either way.
 *
 * Body: `{ month: "2026-08", half: "FIRST" | "SECOND", status: "CLOSED" | "OPEN" }`.
 */
export async function PATCH(request: NextRequest) {
  const gate = await requireMobileWrite(request, "manage_owner_finances", "cockpit");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const input = (body ?? {}) as Record<string, unknown>;
  const parsed = settlementRefSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json({ error: "That settlement period is not valid." }, { status: 422 });
  }
  const { month, half } = parsed.data;
  const status = input.status === "OPEN" ? "OPEN" : "CLOSED";

  const revalidate = () => {
    for (const path of ["/settlements", "/dashboard", "/reserves"]) revalidatePath(path);
  };

  try {
    if (status === "OPEN") {
      await gate.repository.reopenSettlement(settlementId(month, half));
      revalidate();
      return NextResponse.json({ id: settlementId(month, half), status });
    }

    const dataset = await gate.repository.getDataset();
    const plan = planSettlementClose(dataset, month, half, todayISO());
    if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 409 });

    const settlement = await gate.repository.ensureSettlement(month, half);
    if (settlement.status === "CLOSED") {
      return NextResponse.json({ error: "That settlement is already closed." }, { status: 409 });
    }

    await gate.repository.closeSettlement(settlement.id, {
      snapshot: plan.snapshot,
      contributions: plan.contributions,
    });
    revalidate();
    return NextResponse.json({ id: settlement.id, status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update that settlement." },
      { status: 400 },
    );
  }
}
