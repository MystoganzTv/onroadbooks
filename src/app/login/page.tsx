import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { getSession } from "@/lib/auth";
import { safeNextPath } from "@/lib/auth/mobile-handoff";

// Reads the account state and the session cookie, so it must never be
// prerendered -- a build-time render would bake in "no account exists yet".
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; account?: string; next?: string }>;
}) {
  const { error, account, next } = await searchParams;
  // `next` is how the iOS app finishes signing in: it opens this page pointing
  // back at /api/auth/mobile-handoff, and an already-signed-in browser should
  // go straight there rather than to the dashboard.
  const destination = safeNextPath(next);
  if (await getSession()) redirect(destination ?? "/dashboard");
  return (
    <AuthCard
      mode="login"
      next={destination}
      initialError={
        error === "google"
          ? "Google sign-in could not be completed. Try again."
          : error === "invite"
            ? "That invitation is invalid, expired or has been removed. Ask the workspace owner for a new invitation."
            : null
      }
      initialNotice={
        account === "deleted" ? "Your account and business data were permanently deleted." : null
      }
    />
  );
}
