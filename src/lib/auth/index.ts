import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getAuthStore } from "@/lib/db";
import { decodeSession, SESSION_COOKIE, type SessionPayload } from "./session";

/** The signed-in user, or null. Never throws. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return decodeSession(store.get(SESSION_COOKIE)?.value);
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

/** For route handlers, which must answer 401 rather than redirect. */
export async function requireSessionOrNull(): Promise<SessionPayload | null> {
  return getSession();
}

/** True when no owner account exists yet, so the app should offer setup. */
export async function needsSetup(): Promise<boolean> {
  return (await getAuthStore().countUsers()) === 0;
}
