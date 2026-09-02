import { NextResponse, type NextRequest } from "next/server";

import { getMobileSession } from "@/lib/auth/mobile";
import { getRepository } from "@/lib/db";
import { driverSettlementTotals } from "@/lib/driver-pay";
import { capabilityRefusal, hasFleetAccess } from "@/lib/plans";
import { roleCan } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Driver pay statements, newest first.
 *
 * Read-only on the phone by design: building a statement is a desk job with
 * real consequences, and a PAID one is a permanent accounting record. What a
 * phone is good for is checking what a driver was paid and why, which is what
 * this returns — every figure straight from `driverSettlementTotals`, the
 * same function the web detail page renders.
 */
export async function GET(request: NextRequest) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!roleCan(session.role ?? "VIEWER", "manage_driver_settlements")) {
    return NextResponse.json({ error: "Driver pay is not part of your access." }, { status: 403 });
  }

  const dataset = await getRepository(session.businessId).getDataset();
  if (!hasFleetAccess(dataset.subscription)) {
    return NextResponse.json({ error: capabilityRefusal("fleet") }, { status: 403 });
  }

  const driverName = new Map(dataset.drivers.map((driver) => [driver.id, driver.name]));
  const statements = [...dataset.driverSettlements]
    .sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : a.periodEnd > b.periodEnd ? -1 : 0))
    .map((settlement) => {
      const totals = driverSettlementTotals(settlement);
      return {
        id: settlement.id,
        driverId: settlement.driverId,
        driverName: driverName.get(settlement.driverId) ?? "Driver",
        periodStart: settlement.periodStart,
        periodEnd: settlement.periodEnd,
        status: settlement.status,
        paidOn: settlement.paidOn,
        loads: totals.loads,
        grossRevenue: totals.grossRevenue,
        totalMiles: totals.totalMiles,
        basePay: totals.basePay,
        additions: totals.additions,
        deductions: totals.deductions,
        advances: totals.advances,
        netPay: totals.netPay,
      };
    });

  return NextResponse.json(
    { statements },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
