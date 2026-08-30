import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { getSession } from "@/lib/auth";

// Reads the account state and the session cookie, so it must never be
// prerendered -- a build-time render would bake in "no account exists yet".
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; account?: string }>;
}) {
  if (await getSession()) redirect("/dashboard");
  const { error, account } = await searchParams;
  return (
    <AuthCard
      mode="login"
      initialError={error === "google" ? "Google sign-in could not be completed. Try again." : null}
      initialNotice={
        account === "deleted" ? "Your account and business data were permanently deleted." : null
      }
    />
  );
}
