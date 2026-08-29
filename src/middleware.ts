import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/constants";

/**
 * Gate every route at the edge.
 *
 * This only checks that a session cookie is present -- the signature and
 * expiry are verified server side by `getSession()` on each page and route,
 * which is where the secret lives. The middleware exists so an unauthenticated
 * request never reaches a page render at all.
 */
const PUBLIC_PATHS = ["/login", "/setup", "/api/auth"];

/**
 * Static files served straight off disk: everything in public/ plus the
 * app-router icon routes. A page path never contains a dot, so the extension
 * is a safe test -- and it is deliberately NOT applied under /api/, because
 * that is where uploaded receipts are served from and those stay private.
 *
 * Without this, the brand wordmark 307s to /login and next/image reports
 * "the requested resource isn't a valid image ... received null", because the
 * optimizer fetched an HTML login page instead of a PNG.
 */
function isPublicAsset(pathname: string): boolean {
  return !pathname.startsWith("/api/") && /\.[a-z0-9]+$/i.test(pathname);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  if (isPublicAsset(pathname)) {
    return NextResponse.next();
  }

  if (request.cookies.get(SESSION_COOKIE)?.value) {
    return NextResponse.next();
  }

  // API routes answer, pages redirect.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
