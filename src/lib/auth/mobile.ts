import "server-only";

import { getAuthStore, getRepository } from "@/lib/db";
import type { Repository } from "@/lib/db/repository";
import { canWrite, trialState } from "@/lib/plans";
import { permissionRefusal, roleCan, type Permission } from "@/lib/roles";
import { todayISO } from "@/lib/periods";
import { decodeSession, type SessionPayload } from "./session";

/**
 * Bearer-token analogue of `getSession()` (see `index.ts`), for the iOS
 * app's read-only JSON API under `/api/mobile/*`.
 *
 * There is deliberately no new token format: a mobile "access token" is the
 * exact same signed session payload `encodeSession`/`decodeSession` already
 * produce for the web cookie, just carried in an `Authorization: Bearer`
 * header instead of a cookie jar. One signing key, one verification path.
 *
 * Like `getSession()`, this re-checks the authoritative user row on every
 * request rather than trusting the signature alone, so deleting the owner
 * account revokes a mobile device immediately too, not just at the token's
 * expiry.
 */
export async function getMobileSession(request: Request): Promise<SessionPayload | null> {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();

  const session = await decodeSession(token);
  if (!session) return null;

  try {
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
}

export type MobileWriteGate =
  | { ok: true; session: SessionPayload; repository: Repository }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Bearer-token analogue of `requireWritableSession()`, in the same order and
 * with the same refusals: a valid session, then a subscription that may still
 * be written to, then the role's permission.
 *
 * A route handler must answer rather than redirect or throw, so this returns
 * the refusal instead of raising it -- but the checks themselves are the web
 * app's, not a second, looser set. A phone is just another client; it does not
 * get to write something the browser would have refused.
 */
export async function requireMobileWrite(
  request: Request,
  permission: Permission,
): Promise<MobileWriteGate> {
  const session = await getMobileSession(request);
  if (!session) return { ok: false, status: 401, error: "Unauthorized" };

  const repository = getRepository(session.businessId);
  const { subscription } = await repository.getDataset();
  const today = todayISO();
  if (!canWrite(subscription, today)) {
    const trial = trialState(subscription, today);
    return {
      ok: false,
      status: 403,
      error: trial?.expired
        ? "Your free trial has ended. Choose a plan to keep adding or changing records. Your existing books remain available to read and export."
        : "Your subscription needs attention before you can add or change records. Your existing books remain available to read and export.",
    };
  }

  const role = session.role ?? "VIEWER";
  if (!roleCan(role, permission)) {
    return { ok: false, status: 403, error: permissionRefusal(role, permission) };
  }

  return { ok: true, session, repository };
}
