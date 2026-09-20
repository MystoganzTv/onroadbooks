import { NextResponse } from "next/server";
import { googleSignInConfigured } from "@/lib/auth/google-availability";
import { safeNextPath } from "@/lib/auth/mobile-handoff";

export const runtime = "nodejs";

/** Start the Auth.js PKCE flow for web or the existing mobile handoff. */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const failure = () => NextResponse.redirect(new URL("/login?error=google", requestUrl.origin));
  if (!googleSignInConfigured()) return failure();
  try {
    const { signIn } = await import("@/auth");
    const destination = await signIn("google", {
      redirect: false,
      redirectTo: safeNextPath(requestUrl.searchParams.get("next")) ?? "/api/auth/complete",
    });
    return NextResponse.redirect(destination);
  } catch {
    return failure();
  }
}
