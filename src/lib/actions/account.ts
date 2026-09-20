"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth";
import { getAuthStore } from "@/lib/db";
import { getDocumentStorage } from "@/lib/storage";
import { clearWebSessions } from "@/lib/auth/provider-admin";
import type { ActionResult } from "./types";

async function removeStoredDocuments(keys: string[]): Promise<void> {
  const storage = getDocumentStorage();
  await Promise.allSettled(keys.map((key) => storage.remove(key)));
}

export async function resetAccountData(
  confirmation: string,
): Promise<ActionResult> {
  try {
    // Data ownership controls must remain available after a trial or
    // subscription ends. Billing can lock bookkeeping writes, but it must not
    // prevent an authenticated owner from resetting or deleting their data.
    const session = await requirePermission("manage_account");
    if (confirmation.trim() !== "RESET") {
      return { ok: false, error: "Type RESET to confirm." };
    }

    const storageKeys = await getAuthStore().resetBusinessData(
      session.userId,
      session.businessId,
    );
    await removeStoredDocuments(storageKeys);
    revalidatePath("/", "layout");
    return { ok: true, id: "reset" };
  } catch (error) {
    return {
      ok: false,
      error: (error as Error).message || "Could not reset this account.",
    };
  }
}

export async function deleteCurrentAccount(
  confirmation: string,
): Promise<ActionResult> {
  try {
    const session = await requirePermission("manage_account");
    if (confirmation.trim() !== session.email) {
      return {
        ok: false,
        error: "Type your email address exactly to confirm.",
      };
    }

    const deleted = await getAuthStore().deleteAccount(
      session.userId,
      session.businessId,
    );
    await removeStoredDocuments(deleted.storageKeys);

    // Identity/invitation rows were removed by FK cascade. Clear the browser
    // session as well; every other session reloads the now-missing user.
    try {
      await clearWebSessions();
    } catch (error) {
      console.error("[account-delete] Session revocation failed", error);
    }

    return { ok: true, id: "deleted" };
  } catch (error) {
    return {
      ok: false,
      error: (error as Error).message || "Could not delete this account.",
    };
  }
}
