import "server-only";

/**
 * Everything the /admin/onroad-ai page shows, gathered on the server. Only
 * aggregates and masked numbers leave this module: no message text, no
 * profile contents, no full phone numbers.
 */

import { alertSettingsFromEnv } from "./alerts";
import { createBotDeps, monitoringFromEnv, storeFromEnv, whatsappSettings } from "./config";
import { DatLoadBoardProvider, datConfigFromEnv } from "./loadboard/dat";
import { buildReport, checkHealth, maskWaId, type CostReport, type HealthIssue } from "./monitoring";
import { planConfigFromEnv } from "./plans";
import { dayKey } from "./router";
import type { OperationalCounts } from "./store/types";

export interface AdminDriverRow {
  id: string;
  label: string;
  name: string | null;
  plan: "FREE" | "PRO";
  planStatus: string | null;
  state: "BLOCKED" | "ONBOARDING" | "ACTIVE";
  joined: string;
  lastMessage: string | null;
  loads: number;
  cost30Usd: number;
}

export type AdminDashboard =
  | { kind: "NO_STORE" }
  | {
      kind: "READY";
      enabled: boolean;
      status: {
        whatsapp: boolean;
        interpreter: boolean;
        voice: boolean;
        billing: boolean;
        loadBoard: "LIVE" | "TEST" | "OFF";
        alertTemplate: boolean;
      };
      report: CostReport;
      health: { counts: OperationalCounts; issues: HealthIssue[] };
      drivers: AdminDriverRow[];
      onboardedDrivers: number;
    };

export async function loadAdminDashboard(): Promise<AdminDashboard> {
  let store;
  try {
    store = storeFromEnv();
  } catch {
    return { kind: "NO_STORE" };
  }
  const settings = whatsappSettings();
  const deps = settings ? createBotDeps(settings) : null;
  const timeZone = process.env.ONROAD_AI_TIME_ZONE?.trim() || "America/New_York";
  const now = new Date();
  const today = dayKey(now, timeZone);
  const monitoring = monitoringFromEnv();
  const report = await buildReport(store, today, monitoring);
  const health = await checkHealth(store, now, today, monitoring, Number(process.env.ONROAD_AI_NEW_USER_SPIKE ?? 100) || 0);
  const users = await store.listUsersForAdmin({ limit: 200, since30d: new Date(`${report.fromDay}T00:00:00Z`), day30: report.fromDay });
  const provider = deps?.loadBoards.find((item) => item.status().available) ?? null;
  return {
    kind: "READY",
    enabled: Boolean(settings),
    status: {
      whatsapp: Boolean(settings),
      interpreter: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
      voice: Boolean(process.env.OPENAI_API_KEY?.trim()),
      billing: planConfigFromEnv().billingEnabled && Boolean(process.env.STRIPE_ONROAD_AI_WEBHOOK_SECRET?.trim()),
      loadBoard: provider ? (provider.isMock ? "TEST" : "LIVE") : new DatLoadBoardProvider(datConfigFromEnv()).status().available ? "LIVE" : "OFF",
      alertTemplate: Boolean(alertSettingsFromEnv().template),
    },
    report,
    health: { counts: health.counts, issues: health.issues },
    onboardedDrivers: users.filter((user) => user.onboarded).length,
    drivers: users.map((user) => ({
      id: user.id,
      label: maskWaId(user.waId),
      name: user.displayName,
      plan: user.plan,
      planStatus: user.planStatus,
      state: user.blockedAt ? "BLOCKED" : user.onboarded ? "ACTIVE" : "ONBOARDING",
      joined: user.createdAt.toISOString().slice(0, 10),
      lastMessage: user.lastInboundAt ? user.lastInboundAt.toISOString() : null,
      loads: user.loads,
      cost30Usd: user.costMicros30d / 1_000_000,
    })),
  };
}
