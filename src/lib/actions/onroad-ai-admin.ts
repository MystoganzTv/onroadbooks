"use server";

import { revalidatePath } from "next/cache";

import { requireAdminSession } from "@/lib/auth/admin";
import { alertSettingsFromEnv, runAlerts } from "@/lib/onroad-ai/alerts";
import { createBotDeps, storeFromEnv, whatsappSettings } from "@/lib/onroad-ai/config";
import { sweepPending } from "@/lib/onroad-ai/processor";

import type { ActionResult } from "./types";

type DataResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Operator actions for /admin/onroad-ai. Each one re-checks the platform
 * admin allowlist on the server; the page hiding a button is not the rule.
 * Drivers are addressed by their internal id, never by phone number.
 */

function failure(error: unknown): Extract<ActionResult, { ok: false }> {
  return { ok: false, error: error instanceof Error ? error.message : "Unexpected error." };
}

export async function onroadAiSetBlocked(userId: string, blocked: boolean): Promise<ActionResult> {
  try {
    await requireAdminSession();
    if (!/^wau_[0-9a-f-]{36}$/.test(userId)) throw new Error("Driver not found.");
    const store = storeFromEnv();
    const user = await store.getUserById(userId);
    if (!user) throw new Error("Driver not found.");
    await store.updateUser(user.id, blocked ? { blockedAt: new Date(), blockedReason: "blocked by operator" } : { blockedAt: null, blockedReason: null });
    revalidatePath("/admin/onroad-ai");
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function onroadAiRetryPending(): Promise<DataResult<{ processed: number; failed: number }>> {
  try {
    await requireAdminSession();
    const settings = whatsappSettings();
    if (!settings) throw new Error("OnRoad AI is not enabled.");
    const result = await sweepPending(createBotDeps(settings), 50);
    revalidatePath("/admin/onroad-ai");
    return { ok: true, data: { processed: result.processed, failed: result.failed } };
  } catch (error) {
    return failure(error);
  }
}

export async function onroadAiRunAlerts(): Promise<DataResult<{ checked: number; sent: number; noProvider: boolean }>> {
  try {
    await requireAdminSession();
    const settings = whatsappSettings();
    if (!settings) throw new Error("OnRoad AI is not enabled.");
    const result = await runAlerts(createBotDeps(settings), alertSettingsFromEnv());
    revalidatePath("/admin/onroad-ai");
    return { ok: true, data: { checked: result.checked, sent: result.sent, noProvider: result.skippedNoProvider } };
  } catch (error) {
    return failure(error);
  }
}
