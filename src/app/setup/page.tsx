import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SetupFlow } from "@/components/auth/setup-flow";
import { getSession } from "@/lib/auth";
import { getWebDictionary } from "@/lib/i18n/dictionaries";
import { getAppLocale } from "@/lib/i18n-server";

// Reads the account state and the session cookie, so it must never be
// prerendered -- a build-time render would bake in "no account exists yet".
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).auth.setupMetadata };
}

export default async function SetupPage() {
  if (await getSession()) redirect("/dashboard");
  const locale = await getAppLocale();
  return <SetupFlow locale={locale} />;
}
