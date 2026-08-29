import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { getSession, needsSetup } from "@/lib/auth";

// Reads the account state and the session cookie, so it must never be
// prerendered -- a build-time render would bake in "no account exists yet".
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await needsSetup()) redirect("/setup");
  if (await getSession()) redirect("/dashboard");
  return <AuthCard mode="login" />;
}
