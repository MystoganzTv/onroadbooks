import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getAuthStore, getDataset } from "@/lib/db";
import { canWrite, trialState } from "@/lib/plans";
import { permissionRefusal, roleCan, type Permission } from "@/lib/roles";
import { todayISO } from "@/lib/periods";
import { decodeSession, SESSION_COOKIE, type SessionPayload } from "./session";

/** The signed-in user, or null. Never throws. */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  try {
    const store = await cookies();
    const session = await decodeSession(store.get(SESSION_COOKIE)?.value);
    if (!session) return null;

    // A signed cookie alone is not enough after an account is deleted. Check
    // the authoritative owner row so deletion immediately revokes every app
    // session, including cookies held by another browser.
    const owner = await getAuthStore().findUserById(session.userId);
    if (!owner || owner.businessId !== session.businessId || owner.email !== session.email) {
      return null;
    }
    return {
      userId: session.userId,
      businessId: session.businessId,
      email: session.email,
      exp: session.exp,
      role: owner.role,
    };
  } catch {
    return null;
  }
});

/**
 * The session every page and action must go through.
 *
 * Returns the businessId that scopes every repository call, so a request can
 * only ever read or write its own business's rows.
 */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** A signed-in owner whose ledger may be changed. */
export async function requireWritableSession(
  permission: Permission = "manage_business",
): Promise<SessionPayload> {
  const session = await requireSession();
  const { subscription } = await getDataset(session.businessId);
  const today = todayISO();
  if (!canWrite(subscription, today)) {
    const trial = trialState(subscription, today);
    throw new Error(
      trial?.expired
        ? "Your free trial has ended. Choose a plan to keep adding or changing records. Your existing books remain available to read and export."
        : "Your subscription needs attention before you can add or change records. Your existing books remain available to read and export.",
    );
  }
  const role = session.role ?? "VIEWER";
  if (!roleCan(role, permission)) throw new Error(permissionRefusal(role, permission));
  return session;
}

/** Role gate for ownership actions that must remain available when billing lapses. */
export async function requirePermission(permission: Permission): Promise<SessionPayload> {
  const session = await requireSession();
  const role = session.role ?? "VIEWER";
  if (!roleCan(role, permission)) throw new Error(permissionRefusal(role, permission));
  return session;
}

/** For route handlers, which must answer 401 rather than redirect. */
export async function requireSessionOrNull(): Promise<SessionPayload | null> {
  return getSession();
}

/** True when no owner account exists yet, so the app should offer setup. */
export async function needsSetup(): Promise<boolean> {
  return (await getAuthStore().countUsers()) === 0;
}
