import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { DRIVER_PAY_TYPES } from "@/lib/driver-pay";
import { toCsv } from "@/lib/export";
import { hasFleetAccess } from "@/lib/plans";
import { roleCan } from "@/lib/roles";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!roleCan(session.role ?? "VIEWER", "manage_driver_settlements")) {
    return NextResponse.json({ error: "Driver pay access is not available for this role." }, { status: 403 });
  }
  const dataset = await getRepository(session.businessId).getDataset();
  if (!hasFleetAccess(dataset.subscription)) return NextResponse.json({ error: "Fleet access required." }, { status: 403 });
  const { id } = await params;
  const settlement = dataset.driverSettlements.find((row) => row.id === id);
  if (!settlement) return NextResponse.json({ error: "Statement not found." }, { status: 404 });
  const driver = dataset.drivers.find((row) => row.id === settlement.driverId);
  const rows: (string | number)[][] = [];
  for (const line of settlement.lines) {
    const load = dataset.loads.find((row) => row.id === line.loadId);
    const truck = dataset.trucks.find((row) => row.id === line.truckId);
    rows.push([load?.date ?? "", load?.loadNumber ?? "", load ? `${load.originCity}, ${load.originState} to ${load.destinationCity}, ${load.destinationState}` : line.loadId, truck?.name ?? line.truckId, DRIVER_PAY_TYPES.find((type) => type.id === line.payType)?.label ?? line.payType, line.payRate, line.grossRevenue, line.loadedMiles, line.totalMiles, line.payAmount, settlement.status, settlement.paidOn ?? ""]);
  }
  const csv = toCsv({
    title: "Driver statement",
    columns: ["Pickup date", "Load number", "Route", "Truck", "Pay method", "Pay rate", "Gross revenue", "Loaded miles", "Total miles", "Driver pay", "Status", "Paid on"],
    rows,
  });
  const safeDriver = (driver?.name ?? "driver").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="driver-statement-${safeDriver}-${settlement.periodStart}-${settlement.periodEnd}.csv"`, "Cache-Control": "no-store" } });
}
