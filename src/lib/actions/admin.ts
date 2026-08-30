"use server";

import { revalidatePath } from "next/cache";

import { ADMIN_EMAIL, requireAdminSession } from "@/lib/auth/admin";
import { DEMO_EMAIL } from "@/lib/auth/constants";
import { getAuthStore } from "@/lib/db";
import { getDocumentStorage } from "@/lib/storage";
import { deleteSupabaseAuthUserByEmail } from "@/lib/supabase/admin";
import type { ActionResult } from "./types";

async function targetAccount(userId: string) {
  const account = (await getAuthStore().listAccounts()).find((candidate) => candidate.userId === userId);
  if (!account) throw new Error("That account no longer exists.");
  return account;
}

async function removeStoredDocuments(keys: string[]): Promise<void> {
  const storage = getDocumentStorage();
  await Promise.allSettled(keys.map((key) => storage.remove(key)));
}

function protectedAccount(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return normalized === ADMIN_EMAIL || normalized === DEMO_EMAIL;
}

export async function adminResetAccountData(
  userId: string,
  confirmation: string,
): Promise<ActionResult> {
  try {
    const admin = await requireAdminSession();
    const account = await targetAccount(userId);
    if (protectedAccount(account.email)) {
      return { ok: false, error: "The admin and demo accounts are protected." };
    }
    if (confirmation.trim() !== `RESET ${account.email}`) {
      return { ok: false, error: `Type RESET ${account.email} to confirm.` };
    }

    const storageKeys = await getAuthStore().resetBusinessData(account.userId, account.businessId);
    await removeStoredDocuments(storageKeys);
    console.info("[admin-account-reset]", { admin: admin.email, target: account.email });
    revalidatePath("/admin");
    return { ok: true, id: account.userId };
  } catch (error) {
    return { ok: false, error: (error as Error).message || "Could not reset the account." };
  }
}

export async function adminDeleteAccount(
  userId: string,
  confirmation: string,
): Promise<ActionResult> {
  try {
    const admin = await requireAdminSession();
    const account = await targetAccount(userId);
    if (protectedAccount(account.email)) {
      return { ok: false, error: "The admin and demo accounts are protected." };
    }
    if (account.hasProviderSubscription) {
      return {
        ok: false,
        error: "Cancel this account's Stripe subscription before deleting it so billing cannot continue.",
      };
    }
    if (confirmation.trim() !== account.email) {
      return { ok: false, error: "Type the account email exactly to confirm." };
    }

    const deleted = await getAuthStore().deleteAccount(account.userId, account.businessId);
    await removeStoredDocuments(deleted.storageKeys);
    try {
      await deleteSupabaseAuthUserByEmail(deleted.email);
    } catch (error) {
      console.error("[admin-account-delete] Supabase identity cleanup failed", error);
    }
    console.info("[admin-account-delete]", { admin: admin.email, target: account.email });
    revalidatePath("/admin");
    return { ok: true, id: account.userId };
  } catch (error) {
    return { ok: false, error: (error as Error).message || "Could not delete the account." };
  }
}
