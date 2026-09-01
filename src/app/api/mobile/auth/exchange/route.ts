import { NextResponse } from "next/server";

import { decodeHandoffCode } from "@/lib/auth/mobile-handoff";
import { encodeSession, sessionExpiry } from "@/lib/auth/session";
import { getAuthStore } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Redeem a browser sign-in for a mobile token. Answers in exactly the shape
 * `/api/mobile/login` does, so the app stores a session the same way whichever
 * door it came through.
 *
 * The code alone is not enough: without the verifier it was bound to, it is a
 * signed blob that mints nothing.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { code?: unknown; verifier?: unknown }
    | null;
  const code = typeof body?.code === "string" ? body.code : "";
  const verifier = typeof body?.verifier === "string" ? body.verifier : "";
  if (!code || !verifier) {
    return NextResponse.json({ error: "Sign-in expired. Try again." }, { status: 400 });
  }

  const claims = await decodeHandoffCode(code, verifier);
  if (!claims) {
    return NextResponse.json({ error: "Sign-in expired. Try again." }, { status: 401 });
  }

  // The code says who signed in two minutes ago; the user row says whether that
  // account still exists and still belongs where it claims. Same check
  // `getMobileSession` makes on every request.
  const user = await getAuthStore().findUserById(claims.userId);
  if (!user || user.businessId !== claims.businessId) {
    return NextResponse.json({ error: "That account is no longer available." }, { status: 401 });
  }

  const exp = sessionExpiry();
  const token = await encodeSession({
    userId: user.id,
    businessId: user.businessId,
    email: user.email,
    exp,
  });

  return NextResponse.json({
    token,
    expiresAt: new Date(exp * 1000).toISOString(),
    email: user.email,
    name: user.name,
  });
}
