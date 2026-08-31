import "server-only";

import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";

import {
  encodeSession,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  sessionExpiry,
} from "@/lib/auth/session";
import { getAuthStore } from "@/lib/db";

function profileName(metadata: Record<string, unknown>): string | null {
  const candidate = metadata.full_name ?? metadata.name;
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim().slice(0, 120)
    : null;
}

function businessName(name: string | null): string {
  const first = name?.split(/\s+/)[0]?.trim();
  return first ? `${first}'s Trucking Business` : "My Trucking Business";
}

/**
 * Creates the app-level session after Supabase has verified an identity.
 * User metadata is used only for display defaults, never for authorization.
 */
export async function completeSupabaseSignIn(
  user: User,
  { isInvitation = false }: { isInvitation?: boolean } = {},
): Promise<{ isNew: boolean; redirectTo: string }> {
  if (!user.email) throw new Error("Google did not return an email.");

  const authStore = getAuthStore();
  let appUser = await authStore.findUserByEmail(user.email);
  const isNew = !appUser;

  if (!appUser) {
    // Invite authorization comes from the pre-created app row, never from
    // email metadata or a role supplied to Supabase. A stray invite token
    // cannot manufacture a workspace owner.
    if (isInvitation) throw new Error("This workspace invitation no longer exists.");
    const name = profileName(user.user_metadata);
    appUser = await authStore.createOwner({
      email: user.email,
      name,
      businessName: businessName(name),
      // Not a valid scrypt hash: this identity may sign in only through its
      // verified Google account unless a password flow is added later.
      passwordHash: "oauth$google",
    });
  } else if (!appUser.joinedAt) {
    appUser = await authStore.markMemberJoined(appUser.id, appUser.businessId);
  }

  const token = await encodeSession({
    userId: appUser.id,
    businessId: appUser.businessId,
    email: appUser.email,
    exp: sessionExpiry(),
  });
  (await cookies()).set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);

  return {
    isNew,
    redirectTo: isNew ? "/welcome" : isInvitation ? "/dashboard?team=joined" : "/dashboard",
  };
}
