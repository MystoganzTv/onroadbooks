import type { Metadata } from "next";

import { InviteAcceptance } from "@/components/auth/invite-acceptance";
import { getWebDictionary } from "@/lib/i18n/dictionaries";
import { getAppLocale } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).auth.inviteMetadata };
}

export default async function AcceptInvitationPage() {
  const locale = await getAppLocale();
  return <InviteAcceptance locale={locale} />;
}
