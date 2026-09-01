import { NextResponse } from "next/server";

import { getAuthStore } from "@/lib/db";
import { credentialsSchema } from "@/lib/schemas";
import { encodeSession, sessionExpiry, verifyPassword } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mobile analogue of `/api/auth/login` (see that route for the pattern this
 * mirrors). The only difference: the token comes back in the JSON body for
 * the app to store in the Keychain, instead of being set as an httpOnly
 * cookie. Same credential check, same one-message-for-both-failures rule so
 * the response can't be used to enumerate accounts.
 */
export async function POST(request: Request) {
  const parsed = credentialsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  }

  const user = await getAuthStore().findUserByEmail(parsed.data.email);
  const valid = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
  if (!user || !valid) {
    return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
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
  });
}
