import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { dayKey } from "@/lib/onroad-ai/router";
import { adminToken, createBotDeps, retentionDays, whatsappSettings } from "@/lib/onroad-ai/config";
import { sweepPending } from "@/lib/onroad-ai/processor";
import { alertSettingsFromEnv, runAlerts } from "@/lib/onroad-ai/alerts";
import { DatLoadBoardProvider, datConfigFromEnv } from "@/lib/onroad-ai/loadboard/dat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const noStore = { "Cache-Control": "no-store" };

/**
 * OPERATIONS API -- for the operator, not for drivers.
 *
 * Authorization: Bearer $ONROAD_AI_ADMIN_TOKEN (at least 32 characters).
 * Without the token configured the route does not exist (404).
 *
 *   GET                         counts, today's usage and estimated cost, provider status
 *   POST {"action":"sweep"}     retry unanswered messages now
 *   POST {"action":"purge"}     drop message payloads past retention
 *   POST {"action":"alerts"}    check due load alerts now
 *   POST {"action":"block","waId":"1555…","reason":"spam"}  /  {"action":"unblock","waId":"1555…"}
 *   POST {"action":"deleteUser","waId":"15551234567"}   erase one driver (support request)
 *
 * Returns aggregates only: no message text, no profile contents.
 */
function authorized(request: Request): boolean | null {
  const token = adminToken();
  if (!token) return null;
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${token}`);
  const received = Buffer.from(header);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function gate(request: Request) {
  const ok = authorized(request);
  if (ok === null) return new NextResponse("Not found", { status: 404, headers: noStore });
  if (!ok) return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: noStore });
  const settings = whatsappSettings();
  if (!settings) return NextResponse.json({ error: "OnRoad AI is not enabled." }, { status: 503, headers: noStore });
  return settings;
}

export async function GET(request: Request) {
  const settings = gate(request);
  if (settings instanceof NextResponse) return settings;
  const deps = createBotDeps(settings);
  const stats = await deps.store.adminStats(dayKey(deps.now(), deps.timeZone));
  return NextResponse.json(
    {
      ...stats,
      estimatedCostTodayUsd: stats.usageToday.costMicros / 1_000_000,
      ai: { interpreter: deps.interpreter.configured, transcriber: deps.transcriber.configured },
      loadBoards: deps.loadBoards.map((provider) => ({ id: provider.id, isMock: provider.isMock, status: provider.status() })),
      dat: new DatLoadBoardProvider(datConfigFromEnv()).status(),
      retentionDays: retentionDays(),
    },
    { headers: noStore },
  );
}

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sweep") }),
  z.object({ action: z.literal("purge") }),
  z.object({ action: z.literal("alerts") }),
  z.object({ action: z.literal("block"), waId: z.string().regex(/^\d{6,20}$/), reason: z.string().max(200).optional() }),
  z.object({ action: z.literal("unblock"), waId: z.string().regex(/^\d{6,20}$/) }),
  z.object({ action: z.literal("deleteUser"), waId: z.string().regex(/^\d{6,20}$/) }),
]);

export async function POST(request: Request) {
  const settings = gate(request);
  if (settings instanceof NextResponse) return settings;
  const parsed = action.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Unknown action." }, { status: 400, headers: noStore });
  const deps = createBotDeps(settings);
  switch (parsed.data.action) {
    case "sweep":
      return NextResponse.json(await sweepPending(deps, 50), { headers: noStore });
    case "block":
    case "unblock": {
      const user = await deps.store.findUserByWaId(parsed.data.waId);
      if (user) {
        await deps.store.updateUser(user.id, parsed.data.action === "block"
          ? { blockedAt: new Date(), blockedReason: parsed.data.reason ?? "blocked by operator" }
          : { blockedAt: null, blockedReason: null });
      }
      return NextResponse.json({ updated: Boolean(user) }, { headers: noStore });
    }
    case "alerts":
      return NextResponse.json(await runAlerts(deps, alertSettingsFromEnv()), { headers: noStore });
    case "purge": {
      const purged = await deps.store.purgeEventPayloads(new Date(Date.now() - retentionDays() * 86_400_000));
      return NextResponse.json({ purged }, { headers: noStore });
    }
    case "deleteUser": {
      const user = await deps.store.findUserByWaId(parsed.data.waId);
      if (user) await deps.store.deleteUser(user.id);
      return NextResponse.json({ deleted: Boolean(user) }, { headers: noStore });
    }
  }
}
