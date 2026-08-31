import "server-only";

import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth";
import type { SessionPayload } from "@/lib/auth/session";
import { isPlatformAdminEmail } from "@/lib/platform-admin";

/** Every admin mutation must authorize again at the server boundary. */
export async function requireAdminSession(): Promise<SessionPayload> {
  const session = await requireSession();
  if (!isPlatformAdminEmail(session.email)) {
    throw new Error("You do not have access to the OnRoad Books admin console.");
  }
  return session;
}

/** Pages deny access with navigation instead of leaking a server exception. */
export async function requireAdminPageSession(): Promise<SessionPayload> {
  const session = await requireSession();
  if (!isPlatformAdminEmail(session.email)) redirect("/dashboard?access=admin-required");
  return session;
}
