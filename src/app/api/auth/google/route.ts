import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { completeSupabaseSignIn } from "@/lib/auth/complete-supabase-sign-in";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const GOOGLE_NONCE_COOKIE = "onroad_google_nonce";
const NONCE_MAX_AGE_SECONDS = 5 * 60;
const credentialSchema = z.object({ credential: z.string().min(1).max(20_000) });

function nonceCookie(maxAge = NONCE_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/** Issue a short-lived nonce that is also bound to this browser by cookie. */
export async function GET() {
  const nonce = randomBytes(32).toString("base64url");
  (await cookies()).set(GOOGLE_NONCE_COOKIE, nonce, nonceCookie());
  return NextResponse.json(
    { nonce },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Exchange a Google Identity Services ID token for Supabase and app sessions. */
export async function POST(request: Request) {
  const cookieStore = await cookies();

  try {
    const parsed = credentialSchema.safeParse(await request.json());
    const nonce = cookieStore.get(GOOGLE_NONCE_COOKIE)?.value;
    if (!parsed.success || !nonce) {
      return NextResponse.json(
        { error: "Google sign-in expired. Please try again." },
        { status: 400 },
      );
    }

    cookieStore.set(GOOGLE_NONCE_COOKIE, "", nonceCookie(0));
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: parsed.data.credential,
      nonce,
    });

    if (error || !data.user) throw error ?? new Error("Google did not return a user.");
    const { redirectTo } = await completeSupabaseSignIn(data.user);

    return NextResponse.json({ redirectTo });
  } catch (error) {
    console.error("[auth:google] ID token sign-in failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Google sign-in could not be completed. Try again." },
      { status: 401 },
    );
  }
}
