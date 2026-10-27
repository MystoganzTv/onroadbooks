import { NextResponse } from "next/server";

import { alertSettingsFromEnv, runAlerts } from "@/lib/onroad-ai/alerts";
import { createBotDeps, whatsappSettings } from "@/lib/onroad-ai/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };

/**
 * Checks due load alerts. Bearer CRON_SECRET, like the other scheduled
 * routes. Safe to call as often as you like: each alert is checked at most
 * once per ONROAD_AI_ALERT_INTERVAL_MINUTES, and nothing is searched or sent
 * unless an AUTHORIZED load board is available -- today it returns
 * `skippedNoProvider: true` in production.
 *
 * Vercel's daily cron runs it inside /api/whatsapp/maintenance; for hourly
 * checks point any scheduler at this route (docs/onroad-ai.md).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503, headers: noStore });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: noStore });
  }
  const settings = whatsappSettings();
  if (!settings) return NextResponse.json({ skipped: "OnRoad AI is not enabled." }, { headers: noStore });
  const result = await runAlerts(createBotDeps(settings), alertSettingsFromEnv());
  console.info("[cron:onroad-ai-alerts]", result);
  return NextResponse.json(result, { headers: noStore });
}
