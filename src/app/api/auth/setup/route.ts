import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getAuthStore } from "@/lib/db";
import { setupSchema } from "@/lib/schemas";
import {
  encodeSession,
  hashPassword,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  sessionExpiry,
} from "@/lib/auth/session";

export const runtime = "nodejs";

/** Creates the owner account. Only ever available while no user exists. */
export async function POST(request: Request) {
  const store = getAuthStore();

  const parsed = setupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the form." },
      { status: 400 },
    );
  }

  try {
    const user = await store.createOwner({
      email: parsed.data.email,
      name: parsed.data.name ?? null,
      passwordHash: await hashPassword(parsed.data.password),
      businessName: parsed.data.businessName,
      plan: parsed.data.plan ?? "INDIVIDUAL",
    });

    const token = await encodeSession({
      userId: user.id,
      businessId: user.businessId,
      email: user.email,
      exp: sessionExpiry(),
    });
    (await cookies()).set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create the account." },
      { status: 400 },
    );
  }
}
