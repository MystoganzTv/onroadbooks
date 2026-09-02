import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  GOOGLE_OAUTH_NEXT_COOKIE,
  googleOAuthCookie,
} from "@/lib/auth/google-oauth";
import { safeNextPath } from "@/lib/auth/mobile-handoff";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Start a PKCE Google OAuth flow without exposing a personalized account button. */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const next = safeNextPath(requestUrl.searchParams.get("next"));
  const cookieStore = await cookies();

  if (next) {
    cookieStore.set(GOOGLE_OAUTH_NEXT_COOKIE, next, googleOAuthCookie());
  } else {
    cookieStore.set(GOOGLE_OAUTH_NEXT_COOKIE, "", googleOAuthCookie(0));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const callbackUrl = new URL("/api/auth/callback", requestUrl.origin);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl.toString(),
        queryParams: { prompt: "select_account" },
      },
    });

    if (error || !data.url) throw error ?? new Error("Google did not return an OAuth URL.");
    return NextResponse.redirect(data.url);
  } catch (error) {
    cookieStore.set(GOOGLE_OAUTH_NEXT_COOKIE, "", googleOAuthCookie(0));
    console.error("[auth:google] OAuth initialization failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.redirect(new URL("/login?error=google", requestUrl.origin));
  }
}
