"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth";
import { getAuthStore, getRepository } from "@/lib/db";
import { applicationUrl } from "@/lib/stripe";
import { hasFleetAccess } from "@/lib/plans";
import { memberInviteSchema, memberRoleSchema } from "@/lib/schemas";
import {
  deleteSupabaseAuthUserByEmail,
  inviteSupabaseAuthUser,
} from "@/lib/supabase/admin";
import type { ActionResult } from "./types";

async function ownerWithFleet() {
  const session = await requirePermission("manage_team");
  const { subscription } = await getRepository(session.businessId).getDataset();
  if (!hasFleetAccess(subscription)) {
    throw new Error("Team access is included with an active OnRoad Fleet plan.");
  }
  return session;
}

function failed(error: unknown, fallback: string): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : fallback };
}

export async function inviteMemberAction(values: unknown): Promise<ActionResult> {
  const parsed = memberInviteSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the invitation." };
  }

  let createdId: string | null = null;
  try {
    const session = await ownerWithFleet();
    if (parsed.data.email.toLowerCase() === session.email.toLowerCase()) {
      return { ok: false, error: "You are already the workspace owner." };
    }

    const store = getAuthStore();
    const member = await store.createMember({
      businessId: session.businessId,
      email: parsed.data.email,
      name: parsed.data.name,
      role: parsed.data.role,
    });
    createdId = member.id;

    try {
      await inviteSupabaseAuthUser(
        member.email,
        `${applicationUrl()}/invite/accept`,
      );
    } catch (error) {
      // A failed email must not leave behind a ghost member that blocks a retry.
      await store.removeMember(member.id, session.businessId);
      createdId = null;
      throw error;
    }

    revalidatePath("/team");
    return { ok: true, id: member.id };
  } catch (error) {
    return failed(error, createdId ? "The invitation could not be completed." : "Could not invite that member.");
  }
}

export async function updateMemberRoleAction(values: unknown): Promise<ActionResult> {
  const parsed = memberRoleSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: "Choose a valid role." };

  try {
    const session = await ownerWithFleet();
    const member = await getAuthStore().updateMemberRole(
      parsed.data.userId,
      session.businessId,
      parsed.data.role,
    );
    revalidatePath("/team");
    return { ok: true, id: member.id };
  } catch (error) {
    return failed(error, "Could not update that role.");
  }
}

export async function removeMemberAction(userId: string): Promise<ActionResult> {
  try {
    const session = await ownerWithFleet();
    const store = getAuthStore();
    const member = (await store.listMembers(session.businessId)).find((row) => row.id === userId);
    if (!member) return { ok: false, error: "That team member was not found." };
    const removed = await store.removeMember(userId, session.businessId);

    // Removing the app row revokes OnRoad access immediately because every
    // request revalidates membership. Remove the Supabase identity as well so
    // existing auth sessions are revoked and this address can be invited again.
    try {
      await deleteSupabaseAuthUserByEmail(removed.email);
    } catch (error) {
      // App access is already revoked. Do not restore it just because the
      // secondary auth cleanup failed; surface the failure in server logs.
      console.error("[team-remove] Supabase identity cleanup failed", error);
    }
    revalidatePath("/team");
    return { ok: true, id: userId };
  } catch (error) {
    return failed(error, "Could not remove that member.");
  }
}
