import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { getAuthSecret } from "./session";

/**
 * Signing in on the phone with Google, without a second Google client.
 *
 * The app opens the real web sign-in page inside an
 * `ASWebAuthenticationSession`, so Google, the nonce, Supabase and the
 * registered JavaScript origin are the ones that already work in a browser --
 * nothing about identity is reimplemented for iOS.
 *
 * What comes back through the callback is NOT a session. It is a code that is
 * worthless without the verifier the app generated and never sent anywhere:
 * PKCE, in the classic sense. A custom URL scheme can be claimed by any app on
 * the device, so handing a session token through one would mean handing a whole
 * ledger to whoever registered it first. A code bound to a challenge cannot be
 * redeemed by an app that did not start the flow.
 *
 * Codes live two minutes and are stateless -- signed with the same secret as a
 * session, under a different domain prefix so one can never be presented as
 * the other.
 */

const CODE_TTL_SECONDS = 120;
const DOMAIN = "onroad.mobile-handoff.v1";

export interface HandoffClaims {
  userId: string;
  businessId: string;
  email: string;
  challenge: string;
  exp: number;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(DOMAIN + "." + body).digest("base64url");
}

export function challengeFor(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function isOpaqueToken(value: string | null, min = 22, max = 200): value is string {
  return (
    typeof value === "string" &&
    value.length >= min &&
    value.length <= max &&
    /^[A-Za-z0-9._~-]+$/.test(value)
  );
}

export function handoffExpiry(): number {
  return Math.floor(Date.now() / 1000) + CODE_TTL_SECONDS;
}

export async function encodeHandoffCode(claims: HandoffClaims): Promise<string> {
  const secret = await getAuthSecret();
  const body = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return body + "." + sign(body, secret);
}

/**
 * Returns null unless the code is intact, unexpired, and redeemed by whoever
 * holds the verifier behind its challenge.
 */
export async function decodeHandoffCode(
  code: string,
  verifier: string,
): Promise<HandoffClaims | null> {
  const [body, signature] = code.split(".");
  if (!body || !signature) return null;

  const secret = await getAuthSecret();
  const expected = sign(body, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as HandoffClaims;
    if (!claims?.userId || !claims?.businessId || !claims?.challenge) return null;
    if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) return null;

    const presented = Buffer.from(challengeFor(verifier));
    const stored = Buffer.from(claims.challenge);
    if (presented.length !== stored.length || !timingSafeEqual(presented, stored)) return null;

    return claims;
  } catch {
    return null;
  }
}

/**
 * Where a sign-in may send the browser next. Only a path on this site: an
 * absolute URL or a protocol-relative "//host" would turn the sign-in page
 * into an open redirect that hands a fresh session to somebody else's domain.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\")) return null;
  // Printable ASCII only: whitespace, control characters and anything exotic
  // have no business in a path we are about to redirect a signed-in browser to.
  if (/[^\x21-\x7e]/.test(value)) return null;
  return value;
}
