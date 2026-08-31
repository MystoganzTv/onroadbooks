import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAuthStore } from "@/lib/db";
import {
  encodeSession,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  sessionExpiry,
} from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { invitationSessionSchema } from "@/lib/invitation-session";
import { isPendingMemberInvitation } from "@/lib/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return response("Cross-origin invitation requests are refused.", 403);

    const parsed = invitationSessionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return response("The invitation link is missing its verification session.", 400);

    const supabase = await createSupabaseServerClient();
    const { error: sessionError } = "code" in parsed.data
      ? await supabase.auth.exchangeCodeForSession(parsed.data.code)
      : await supabase.auth.setSession({
          access_token: parsed.data.accessToken,
          refresh_token: parsed.data.refreshToken,
        });
    if (sessionError) return response("The invitation session is invalid or expired.", 401);

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.email) {
      return response("The invitation session is invalid or expired.", 401);
    }

    const store = getAuthStore();
    let member = await store.findUserByEmail(data.user.email);
    // The database row is the invitation. Supabase email metadata never gets
    // to choose a workspace or role, and a normal OAuth identity cannot call
    // this route to manufacture membership.
    if (!member || !isPendingMemberInvitation(member)) {
      return response("This workspace invitation no longer exists.", 403);
    }
    member = await store.markMemberJoined(member.id, member.businessId);

    const token = await encodeSession({
      userId: member.id,
      businessId: member.businessId,
      email: member.email,
      exp: sessionExpiry(),
    });
    (await cookies()).set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return response("The invitation could not be accepted.", 400);
  }
}
