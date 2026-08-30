import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getAuthStore } from "@/lib/db";
import {
  encodeSession,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  sessionExpiry,
} from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function profileName(metadata: Record<string, unknown>): string | null {
  const candidate = metadata.full_name ?? metadata.name;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim().slice(0, 120) : null;
}

function businessName(name: string | null): string {
  const first = name?.split(/\s+/)[0]?.trim();
  return first ? `${first}'s Trucking Business` : "My Trucking Business";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=google", request.url));

  try {
    const supabase = await createSupabaseServerClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;

    const { data, error: userError } = await supabase.auth.getUser();
    const oauthUser = data.user;
    if (userError || !oauthUser?.email) throw userError ?? new Error("Google did not return an email.");

    const authStore = getAuthStore();
    let appUser = await authStore.findUserByEmail(oauthUser.email);
    const isNew = !appUser;

    if (!appUser) {
      const name = profileName(oauthUser.user_metadata);
      appUser = await authStore.createOwner({
        email: oauthUser.email,
        name,
        businessName: businessName(name),
        // Not a valid scrypt hash: this identity may sign in only through its
        // verified Google account unless a password flow is added later.
        passwordHash: "oauth$google",
      });
    }

    const token = await encodeSession({
      userId: appUser.id,
      businessId: appUser.businessId,
      email: appUser.email,
      exp: sessionExpiry(),
    });
    (await cookies()).set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);

    return NextResponse.redirect(new URL(isNew ? "/welcome" : "/dashboard", request.url));
  } catch {
    return NextResponse.redirect(new URL("/login?error=google", request.url));
  }
}
