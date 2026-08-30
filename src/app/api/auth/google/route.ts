import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function publicOrigin(request: Request): string {
  const requestUrl = new URL(request.url);
  if (process.env.NODE_ENV === "development") return requestUrl.origin;

  const host = request.headers.get("x-forwarded-host");
  const protocol = request.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${protocol}://${host}` : requestUrl.origin;
}

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${publicOrigin(request)}/api/auth/callback`,
      },
    });

    if (error || !data.url) {
      return NextResponse.redirect(new URL("/login?error=google", request.url));
    }

    return NextResponse.redirect(data.url);
  } catch {
    return NextResponse.redirect(new URL("/login?error=google", request.url));
  }
}
