import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SetupFlow } from "@/components/auth/setup-flow";
import { needsSetup } from "@/lib/auth";

// Reads the account state and the session cookie, so it must never be
// prerendered -- a build-time render would bake in "no account exists yet".
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Set up" };

export default async function SetupPage() {
  // Setup is a one-time door: once an owner exists it must never be reachable.
  if (!(await needsSetup())) redirect("/login");
  return <SetupFlow />;
}
