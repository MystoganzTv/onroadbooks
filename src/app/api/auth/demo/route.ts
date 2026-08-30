import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getAuthStore } from "@/lib/db";
import {
  encodeSession,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  sessionExpiry,
} from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await getAuthStore().ensureDemoUser();
    const token = await encodeSession({
      userId: user.id,
      businessId: user.businessId,
      email: user.email,
      isDemo: true,
      exp: sessionExpiry(),
    });

    (await cookies()).set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The demo is unavailable." },
      { status: 503 },
    );
  }
}
