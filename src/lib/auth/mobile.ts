import "server-only";

import { getAuthStore } from "@/lib/db";
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
