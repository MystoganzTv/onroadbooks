import { NextResponse, type NextRequest } from "next/server";

import { getMobileSession } from "@/lib/auth/mobile";
import {
  brokerPerformance,
  linkedFuelByLoad,
  loadsInPeriod,
  thresholdsFromSettings,
  withMetricsAll,
} from "@/lib/calculations";
import { getRepository } from "@/lib/db";
import { calculateLanePerformance, rankLanes } from "@/lib/finance/lanes";
import { periodFromSearchParams } from "@/lib/period-params";
import { capabilityRefusal, planAllows } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Which lanes and which brokers are worth repeating.
 *
 * A cockpit capability on the web, so a cockpit capability here. And the rule
 * that makes these numbers trustworthy travels with them: `rankLanes` refuses
 * to rank a lane until it has enough loads to mean anything (ADR-0014), so the
 * app shows "emerging" lanes with how many more loads they need rather than
 * crowning a winner off one lucky run.
 */
export async function GET(request: NextRequest) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const period = periodFromSearchParams(Object.fromEntries(request.nextUrl.searchParams));
  const dataset = await getRepository(session.businessId).getDataset();

  if (!planAllows(dataset.subscription, "cockpit")) {
    return NextResponse.json({ error: capabilityRefusal("cockpit") }, { status: 403 });
  }

  const thresholds = thresholdsFromSettings(dataset.settings);
  const scored = withMetricsAll(
    loadsInPeriod(dataset.loads, period),
    thresholds,
    linkedFuelByLoad(dataset.fuelEntries),
  );

  const lanes = calculateLanePerformance(scored, thresholds);
  const ranking = rankLanes(lanes);
  const brokers = brokerPerformance(scored, thresholds);

  const lane = (entry: (typeof lanes)[number]) => ({
    key: entry.key,
    label: entry.label,
    loadCount: entry.loadCount,
    revenue: entry.revenue,
    profitPerMile: entry.profitPerMile,
    deadheadPct: entry.deadheadPct,
    rating: entry.rating,
  });

  return NextResponse.json(
    {
      periodLabel: period.label,
      minLoads: ranking.minLoads,
      qualifiedCount: ranking.qualifiedCount,
      best: ranking.best.map(lane),
      worst: ranking.worst.map(lane),
      // Seen, but not ranked yet. Saying how many more loads a lane needs is
      // the honest version of "we do not know yet".
      emerging: ranking.emerging.map((entry) => ({
        ...lane(entry),
        loadsNeeded: Math.max(ranking.minLoads - entry.loadCount, 0),
      })),
      brokers: brokers.map((broker) => ({
        broker: broker.broker,
        loadCount: broker.loadCount,
        revenue: broker.revenue,
        profitPerMile: broker.profitPerMile,
        deadheadPct: broker.deadheadPct,
        outstanding: broker.outstanding,
        rating: broker.rating,
      })),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
