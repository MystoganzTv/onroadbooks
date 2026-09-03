import { NextResponse, type NextRequest } from "next/server";

import { getMobileSession } from "@/lib/auth/mobile";
import { getRepository } from "@/lib/db";
import { driverSettlementTotals } from "@/lib/driver-pay";
import { capabilityRefusal, hasFleetAccess } from "@/lib/plans";
import { roleCan } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One statement, opened: the loads it paid for and everything added or taken
 * off afterwards.
 *
 * This is the screen that answers the only question a driver ever asks about
 * a statement — why is this smaller than I expected — which is why the
 * adjustments come back individually rather than as one net figure.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!roleCan(session.role ?? "VIEWER", "manage_driver_settlements")) {
    return NextResponse.json({ error: "Driver pay is not part of your access." }, { status: 403 });
  }

  const { id } = await params;
  const dataset = await getRepository(session.businessId).getDataset();
  if (!hasFleetAccess(dataset.subscription)) {
    return NextResponse.json({ error: capabilityRefusal("fleet") }, { status: 403 });
  }

  const settlement = dataset.driverSettlements.find((row) => row.id === id);
  if (!settlement) return NextResponse.json({ error: "Statement not found." }, { status: 404 });

  const totals = driverSettlementTotals(settlement);
  const driver = dataset.drivers.find((row) => row.id === settlement.driverId);
  const loadById = new Map(dataset.loads.map((load) => [load.id, load]));

  return NextResponse.json(
    {
      statement: {
        id: settlement.id,
        driverId: settlement.driverId,
        driverName: driver?.name ?? "Driver",
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
      },
      lines: settlement.lines.map((line) => {
        const load = loadById.get(line.loadId);
        return {
          id: line.id,
          loadLabel: load
            ? `${load.originCity}, ${load.originState} → ${load.destinationCity}, ${load.destinationState}`
            : "Load",
          date: load?.date ?? settlement.periodStart,
          grossRevenue: line.grossRevenue,
          totalMiles: line.totalMiles,
          payAmount: line.payAmount,
        };
      }),
      adjustments: settlement.adjustments.map((adjustment) => ({
        id: adjustment.id,
        type: adjustment.type,
        label: adjustment.reason,
        amount: adjustment.amount,
      })),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
