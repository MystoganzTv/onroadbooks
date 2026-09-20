import { usingAuthJs, sameOriginRequest } from "@/lib/auth/provider";
import { invitationCredentials } from "@/lib/auth/identity-store";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    if (!sameOriginRequest(request))
      return response("Cross-origin invitation requests are refused.", 403);

    if (usingAuthJs()) {
      const parsed = invitationCredentials.safeParse(
        await request.json().catch(() => null),
      );
      if (!parsed.success)
        return response(
          "Use a valid invitation and a password of at least 10 characters.",
          400,
        );
      try {
        const { signIn } = await import("@/auth");
        await signIn("invitation", {
          ...parsed.data,
          redirect: false,
          redirectTo: "/dashboard?team=joined",
        });
        (await cookies()).set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
        return NextResponse.json(
          { ok: true },
          { headers: { "Cache-Control": "private, no-store" } },
        );
      } catch {
        return response(
          "This invitation is invalid, expired or already used.",
          401,
        );
      }
    }

    return response("Invitations require Auth.js authentication.", 503);
  } catch {
    return response("The invitation could not be accepted.", 400);
  }
}
