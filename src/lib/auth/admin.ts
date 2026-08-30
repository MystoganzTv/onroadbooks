import "server-only";

import { requireSession } from "@/lib/auth";
import type { SessionPayload } from "@/lib/auth/session";

export const ADMIN_EMAIL = "enrique.padron853@gmail.com";

export function isAdminEmail(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === ADMIN_EMAIL;
}

/** Every admin mutation must authorize again at the server boundary. */
export async function requireAdminSession(): Promise<SessionPayload> {
  const session = await requireSession();
  if (!isAdminEmail(session.email)) {
    throw new Error("You do not have access to the OnRoad Books admin console.");
  }
  return session;
}
