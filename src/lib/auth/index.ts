import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAuthStore } from "@/lib/db";
import { decodeSession, SESSION_COOKIE, type SessionPayload } from "./session";

/** The signed-in user, or null. Never throws. */
export async function getSession(): Promise<SessionPayload | null> {
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
    return session;
  } catch {
    return null;
  }
}

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
export async function requireWritableSession(): Promise<SessionPayload> {
  const session = await requireSession();
  if (session.isDemo) {
    throw new Error("The demo account is read-only. Create your own account to save changes.");
  }
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
