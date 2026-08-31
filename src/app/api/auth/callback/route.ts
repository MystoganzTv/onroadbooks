import { NextResponse } from "next/server";

import { completeSupabaseSignIn } from "@/lib/auth/complete-supabase-sign-in";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const otpType = url.searchParams.get("type") as EmailOtpType | null;
  const isInvitation = otpType === "invite" || url.searchParams.get("invited") === "1";
  if (!code && (!tokenHash || !otpType)) {
    return NextResponse.redirect(new URL(`/login?error=${isInvitation ? "invite" : "google"}`, request.url));
  }

  try {
    const supabase = await createSupabaseServerClient();
    if (code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) throw exchangeError;
    } else {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash!,
        type: otpType!,
      });
      if (verifyError) throw verifyError;
    }

    const { data, error: userError } = await supabase.auth.getUser();
    const oauthUser = data.user;
    if (userError || !oauthUser) throw userError ?? new Error("Google did not return a user.");
    const { redirectTo } = await completeSupabaseSignIn(oauthUser, { isInvitation });

    return NextResponse.redirect(new URL(redirectTo, request.url));
  } catch {
    return NextResponse.redirect(new URL(`/login?error=${isInvitation ? "invite" : "google"}`, request.url));
  }
}
