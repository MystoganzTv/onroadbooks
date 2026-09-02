import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { getSession } from "@/lib/auth";
import { safeNextPath } from "@/lib/auth/mobile-handoff";
import { getWebDictionary } from "@/lib/i18n/dictionaries";
import { getAppLocale } from "@/lib/i18n-server";

// Reads the account state and the session cookie, so it must never be
// prerendered -- a build-time render would bake in "no account exists yet".
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).auth.signInMetadata };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; account?: string; next?: string }>;
}) {
  const { error, account, next } = await searchParams;
  const locale = await getAppLocale();
  const copy = getWebDictionary(locale).auth;
  // `next` is how the iOS app finishes signing in: it opens this page pointing
  // back at /api/auth/mobile-handoff, and an already-signed-in browser should
  // go straight there rather than to the dashboard.
  const destination = safeNextPath(next);
  if (await getSession()) redirect(destination ?? "/dashboard");
  return (
    <AuthCard
      mode="login"
      locale={locale}
      next={destination}
      initialError={
        error === "google"
          ? copy.googleFailed
          : error === "invite"
            ? copy.inviteInvalid
            : null
      }
      initialNotice={
        account === "deleted" ? copy.accountDeleted : null
      }
    />
  );
}
