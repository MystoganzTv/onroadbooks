/** Server and proxy may share the selector; never expose credentials here. */
export function usingAuthJs() {
  return process.env.AUTH_PROVIDER === "authjs";
}
export function allowLegacyWebSessions(now = Date.now()) {
  const until = Date.parse(process.env.AUTH_LEGACY_SESSION_UNTIL ?? "");
  return Number.isFinite(until) && now < until;
}
export function sameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  // Browser JSON requests normally carry Origin. Sec-Fetch-Site also rejects
  // cross-site calls where a browser omits it; native clients have neither.
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  if (!origin) return true;
  try {
    return (
      new URL(origin).origin ===
      new URL(
        process.env.AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || request.url,
      ).origin
    );
  } catch {
    return false;
  }
}
