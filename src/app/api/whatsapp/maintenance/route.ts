import { NextResponse } from "next/server";

import { alertSettingsFromEnv, runAlerts } from "@/lib/onroad-ai/alerts";
import { createBotDeps, monitoringFromEnv, retentionDays, whatsappSettings } from "@/lib/onroad-ai/config";
import { checkHealth, describeIssue } from "@/lib/onroad-ai/monitoring";
import { dayKey } from "@/lib/onroad-ai/router";
import { reportOperationalError } from "@/lib/operations";
import { sweepPending } from "@/lib/onroad-ai/processor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };

/**
 * Daily housekeeping, called by Vercel Cron with `Authorization: Bearer
 * $CRON_SECRET` (same secret as the monthly-expenses job):
 *   - retry any messages left unanswered (crash, lost lease)
 *   - drop stored message payloads older than ONROAD_AI_RETENTION_DAYS
 *   - check load alerts (a no-op until an authorized load board is connected)
 *   - check health and cost; email the operator once if anything is wrong
 * Refuses to run without CRON_SECRET, like the other cron route.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503, headers: noStore });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: noStore });
  }
  const settings = whatsappSettings();
  if (!settings) return NextResponse.json({ skipped: "OnRoad AI is not enabled." }, { headers: noStore });

  const deps = createBotDeps(settings);
  const sweep = await sweepPending(deps, 50);
  const cutoff = new Date(Date.now() - retentionDays() * 86_400_000);
  const purged = await deps.store.purgeEventPayloads(cutoff);
  const alerts = await runAlerts(deps, alertSettingsFromEnv());
  const now = deps.now();
  const health = await checkHealth(deps.store, now, dayKey(now, deps.timeZone), monitoringFromEnv(), Number(process.env.ONROAD_AI_NEW_USER_SPIKE ?? 100) || 0);
  if (health.issues.length) {
    await reportOperationalError("OnRoad AI needs attention", new Error(health.issues.map(describeIssue).join("\n")), {
      route: "/api/whatsapp/maintenance",
    });
  }
  console.info("[cron:onroad-ai]", { ...sweep, purged, alerts, issues: health.issues.length });
  return NextResponse.json({ sweep, purged, alerts, health }, { headers: noStore });
}
