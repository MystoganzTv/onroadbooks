import { NextResponse, type NextRequest } from "next/server";

import { getMobileSession } from "@/lib/auth/mobile";
import { brokerContactNames } from "@/lib/broker-contacts";
import { brokerNameKey, brokerNames } from "@/lib/brokers";
import { getRepository } from "@/lib/db";
import { latestFeeDefaults } from "@/lib/load-fees";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What the phone's load form needs to be as quick as the web one: the
 * owner's brokers with the people he books with, and the dispatch and
 * factoring rates from his latest load -- the same `latestFeeDefaults` the
 * web form starts from, so a new load costs the same on both.
 */
export async function GET(request: NextRequest) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataset = await getRepository(session.businessId).getDataset();
  const contacts = brokerContactNames(dataset.loads, dataset.brokers ?? []);
  const brokers = brokerNames(dataset.loads, dataset.brokers ?? []).map((name) => ({
    name,
    contacts: contacts[brokerNameKey(name)] ?? [],
  }));

  return NextResponse.json(
    { feeDefaults: latestFeeDefaults(dataset.loads), brokers },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
