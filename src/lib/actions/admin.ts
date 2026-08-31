"use server";

import { revalidatePath } from "next/cache";

import { requireAdminSession } from "@/lib/auth/admin";
import { getAuthStore, getRepository } from "@/lib/db";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { getDocumentStorage } from "@/lib/storage";
import { deleteSupabaseAuthUserByEmail } from "@/lib/supabase/admin";
import type { PlanId } from "@/lib/types";
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
  return isPlatformAdminEmail(email);
}

async function grantComplimentaryPlan(
  userId: string,
  plan: Extract<PlanId, "OWNER" | "FLEET">,
): Promise<ActionResult> {
  try {
    const admin = await requireAdminSession();
    const account = await targetAccount(userId);
    if (account.hasProviderSubscription) {
      return {
        ok: false,
        error: "Stripe manages this account. Change its plan through billing instead.",
      };
    }

    const repository = getRepository(account.businessId);
    const current = (await repository.getDataset()).subscription;
    if (current.providerSubscriptionId && current.status !== "CANCELED") {
      return { ok: false, error: "Stripe now manages this account. Refresh the admin page." };
    }
    await repository.updateSubscription({
      plan,
      status: "ACTIVE",
      currentPeriodEnd: null,
      // A canceled Stripe id can remain for audit/history. Complimentary
      // access is deliberately detached so it cannot look provider-managed.
      providerSubscriptionId: null,
    });
    console.info("[admin-access-granted]", {
      admin: admin.email,
      plan,
      targetUserId: account.userId,
      targetBusinessId: account.businessId,
    });
    revalidatePath("/admin");
    return { ok: true, id: account.userId };
  } catch (error) {
    return {
      ok: false,
      error: (error as Error).message || `Could not grant complimentary ${plan}.`,
    };
  }
}

export async function adminGrantComplimentaryPro(userId: string): Promise<ActionResult> {
  return grantComplimentaryPlan(userId, "OWNER");
}

export async function adminGrantComplimentaryFleet(userId: string): Promise<ActionResult> {
  return grantComplimentaryPlan(userId, "FLEET");
}

export async function adminEndComplimentaryAccess(userId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdminSession();
    const account = await targetAccount(userId);
    if (account.accessSource !== "complimentary") {
      return { ok: false, error: "This account does not have complimentary access." };
    }

    const repository = getRepository(account.businessId);
    const current = (await repository.getDataset()).subscription;
    if (current.providerSubscriptionId || current.status !== "ACTIVE") {
      return { ok: false, error: "This account's access changed. Refresh the admin page." };
    }
    await repository.updateSubscription({
      plan: "OWNER",
      status: "CANCELED",
      currentPeriodEnd: new Date().toISOString().slice(0, 10),
    });
    console.info("[admin-access-ended]", {
      admin: admin.email,
      plan: current.plan,
      targetUserId: account.userId,
      targetBusinessId: account.businessId,
    });
    revalidatePath("/admin");
    return { ok: true, id: account.userId };
  } catch (error) {
    return { ok: false, error: (error as Error).message || "Could not end complimentary access." };
  }
}

export async function adminResetAccountData(
  userId: string,
  confirmation: string,
): Promise<ActionResult> {
  try {
    const admin = await requireAdminSession();
    const account = await targetAccount(userId);
    if (protectedAccount(account.email)) {
      return { ok: false, error: "The admin account is protected." };
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
      return { ok: false, error: "The admin account is protected." };
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
