/**
 * Route handlers do not inherit Next.js server-action origin protection.
 * Prefer the HTTP Host header because Request.url can be rewritten to an
 * internal hostname by a development server or reverse proxy.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const hostHeader = request.headers.get("host")?.split(",")[0]?.trim();
    const requestHost = hostHeader || new URL(request.url).host;
    return new URL(origin).host === requestHost;
  } catch {
    return false;
  }
}
