"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { requirePermission } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { getAuthStore } from "@/lib/db";
import { getDocumentStorage } from "@/lib/storage";
import { deleteSupabaseAuthUserByEmail } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "./types";

async function removeStoredDocuments(keys: string[]): Promise<void> {
  const storage = getDocumentStorage();
  await Promise.allSettled(keys.map((key) => storage.remove(key)));
}

export async function resetAccountData(confirmation: string): Promise<ActionResult> {
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
    return { ok: false, error: (error as Error).message || "Could not reset this account." };
  }
}

export async function deleteCurrentAccount(confirmation: string): Promise<ActionResult> {
  try {
    const session = await requirePermission("manage_account");
    if (confirmation.trim() !== session.email) {
      return { ok: false, error: "Type your email address exactly to confirm." };
    }

    const deleted = await getAuthStore().deleteAccount(session.userId, session.businessId);
    await removeStoredDocuments(deleted.storageKeys);

    // The app session is authoritative and is cleared first. Supabase Auth is
    // cleaned up server-side as well; failure there cannot restore deleted
    // ledger data or make the now-missing app user valid again.
    (await cookies()).set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    try {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut({ scope: "global" });
    } catch (error) {
      console.error("[account-delete] Supabase session revocation failed", error);
    }
    try {
      await deleteSupabaseAuthUserByEmail(deleted.email);
    } catch (error) {
      console.error("[account-delete] Supabase identity cleanup failed", error);
    }

    return { ok: true, id: "deleted" };
  } catch (error) {
    return { ok: false, error: (error as Error).message || "Could not delete this account." };
  }
}
