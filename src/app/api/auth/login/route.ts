import { authLimitResponse, wrappedRateLimitResponse } from "@/lib/auth/rate-limit";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { usingAuthJs, sameOriginRequest } from "@/lib/auth/provider";
import { getAuthStore } from "@/lib/db";
import { credentialsSchema } from "@/lib/schemas";
import {
  encodeSession,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  sessionExpiry,
  verifyPassword,
} from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOriginRequest(request))
    return NextResponse.json(
      { error: "Cross-origin sign-in is refused." },
      { status: 403 },
    );
  const parsed = credentialsSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter your email and password." },
      { status: 400 },
    );
  }

  if (usingAuthJs()) {
    try {
      const { signIn } = await import("@/auth");
      await signIn("credentials", {
        ...parsed.data,
        redirect: false,
        redirectTo: "/dashboard",
      });
      (await cookies()).set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
      return NextResponse.json({ ok: true });
    } catch (error) {
      const limited = wrappedRateLimitResponse(error);
      if (limited) return limited;
      return NextResponse.json(
        { error: "Email or password is incorrect." },
        { status: 401 },
      );
    }
  }

  const limited = await authLimitResponse(request, "login", parsed.data.email);
  if (limited) return limited;
  const user = await getAuthStore().findUserByEmail(parsed.data.email);

  // One message for both "no such account" and "wrong password", so the
  // response cannot be used to enumerate which emails exist.
  const valid = user
    ? await verifyPassword(parsed.data.password, user.passwordHash)
    : false;
  if (!user || !valid) {
    return NextResponse.json(
      { error: "Email or password is incorrect." },
      { status: 401 },
    );
  }

  const token = await encodeSession({
    userId: user.id,
    businessId: user.businessId,
    email: user.email,
    authVersion: user.authVersion ?? 0,
    exp: sessionExpiry(),
  });

  (await cookies()).set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
  return NextResponse.json({ ok: true });
}
