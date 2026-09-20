import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { usingAuthJs, sameOriginRequest } from "@/lib/auth/provider";
import { SESSION_COOKIE } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOriginRequest(request))
    return NextResponse.json(
      { error: "Cross-origin sign-out is refused." },
      { status: 403 },
    );
  if (usingAuthJs()) {
    const { signOut } = await import("@/auth");
    await signOut({ redirect: false });
  }
  (await cookies()).set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return NextResponse.json({ ok: true });
}
