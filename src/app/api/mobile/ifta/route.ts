import { NextResponse, type NextRequest } from "next/server";

import { getMobileSession } from "@/lib/auth/mobile";
import { getRepository } from "@/lib/db";
import { calculateIftaReport, currentIftaQuarter } from "@/lib/ifta";
import { activeTrucks } from "@/lib/fleet";
import { iftaReportingTruckIds } from "@/lib/ifta-eligibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QUARTER = /^\d{4}-Q[1-4]$/;

/**
 * The IFTA quarter, exactly as `calculateIftaReport` computes it.
 *
 * The important part is what it refuses: a quarter with unassigned miles or
 * missing jurisdiction rates is not "ready", and `netTaxDue` comes back null
 * rather than as a number that looks filable. The app shows what is missing
 * instead. Nobody's tax liability is being computed here either — this is a
 * filing draft built from the owner's own mileage and fuel.
 */
export async function GET(request: NextRequest) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requested = request.nextUrl.searchParams.get("quarter") ?? "";
  const quarter = QUARTER.test(requested) ? requested : currentIftaQuarter();

  const dataset = await getRepository(session.businessId).getDataset();
  const includedTruckIds = iftaReportingTruckIds(dataset.trucks);
  const pendingTruckCount = activeTrucks(dataset.trucks).filter(
    (truck) => truck.iftaReportingEnabled == null,
  ).length;
  const calculated = calculateIftaReport(dataset, quarter, null, includedTruckIds);
  const report = {
    ...calculated,
    complete: calculated.complete && pendingTruckCount === 0,
    netTaxDue: pendingTruckCount === 0 ? calculated.netTaxDue : null,
  };

  return NextResponse.json(
    {
      quarter: report.quarter,
      start: report.start,
      end: report.end,
      complete: report.complete,
      filingScopeComplete: pendingTruckCount === 0,
      includedTruckCount: includedTruckIds.length,
      pendingTruckCount,
      totalFleetMiles: report.totalFleetMiles,
      assignedMiles: report.assignedMiles,
      unassignedMiles: report.unassignedMiles,
      totalGallons: report.totalGallons,
      unassignedGallons: report.unassignedGallons,
      fleetMpg: report.fleetMpg,
      missingRateJurisdictions: report.missingRateJurisdictions,
      netTaxDue: report.netTaxDue,
      jurisdictions: report.jurisdictions.map((row) => ({
        jurisdiction: row.jurisdiction,
        totalMiles: row.totalMiles,
        taxableMiles: row.taxableMiles,
        taxPaidGallons: row.taxPaidGallons,
        netTaxableGallons: row.netTaxableGallons,
        taxRate: row.taxRate,
        taxDue: row.taxDue,
      })),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
