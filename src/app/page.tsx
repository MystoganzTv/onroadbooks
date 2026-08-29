import { redirect } from "next/navigation";

import { getSession, needsSetup } from "@/lib/auth";

// Reads the account state and the session cookie, so it must never be
// prerendered -- a build-time render would bake in "no account exists yet".
export const dynamic = "force-dynamic";

export default async function Home() {
  if (await needsSetup()) redirect("/setup");
  redirect((await getSession()) ? "/dashboard" : "/login");
}
