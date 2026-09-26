import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { getAuthSecret } from "./session";
import { consumeLimit } from "./security-store";

type Action = "login" | "signup" | "reset-request" | "reset-confirm" | "invitation";
const policies: Record<Action, { ip: number; account?: number; window: number }> = {
  login: { ip: 60, account: 10, window: 15 * 60_000 },
  signup: { ip: 10, window: 60 * 60_000 },
  "reset-request": { ip: 20, account: 5, window: 60 * 60_000 },
  "reset-confirm": { ip: 20, window: 15 * 60_000 },
  invitation: { ip: 20, window: 15 * 60_000 },
};
export class AuthRateLimitError extends Error {
  constructor(public retryAfter: number) { super("Too many attempts. Please try again later."); }
}
export async function enforceAuthLimit(request: Request, action: Action, account?: string) {
  const policy = policies[action];
  // Vercel overwrites this header at its edge; do not trust client X-Forwarded-For there.
  const raw = request.headers.get(process.env.VERCEL ? "x-vercel-forwarded-for" : "x-forwarded-for")?.split(",")[0]?.trim();
  const ip = raw && isIP(raw) ? raw : "unknown";
  const secret = await getAuthSecret();
  const key = (kind: string, value: string) => createHmac("sha256", secret).update(`auth:${action}:${kind}:${value}`).digest("hex");
  const checks = [await consumeLimit(key("ip", ip), policy.ip, policy.window)];
  if (account && policy.account) checks.push(await consumeLimit(key("account", account.trim().toLowerCase()), policy.account, policy.window));
  const blocked = checks.find(result => !result.allowed);
  if (blocked) throw new AuthRateLimitError(blocked.retryAfter);
}
export async function authLimitResponse(request: Request, action: Action, account?: string): Promise<Response | null> {
  try { await enforceAuthLimit(request, action, account); return null; }
  catch (error) {
    const limited = error instanceof AuthRateLimitError;
    return Response.json({ error: limited ? error.message : "Sign-in is temporarily unavailable. Please try again." }, { status: limited ? 429 : 503, headers: { "Retry-After": String(limited ? error.retryAfter : 30), "Cache-Control": "no-store" } });
  }
}

/** Auth.js wraps provider failures; preserve a useful 429 at our JSON endpoint. */
export function wrappedRateLimitResponse(error: unknown): Response | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (current instanceof AuthRateLimitError) return Response.json({ error: current.message }, { status: 429, headers: { "Retry-After": String(current.retryAfter), "Cache-Control": "no-store" } });
    const cause = (current as { cause?: { err?: unknown } }).cause;
    current = cause?.err ?? cause;
  }
  return null;
}
