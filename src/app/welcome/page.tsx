import type { Metadata } from "next";

import { WelcomeFlow } from "@/components/onboarding/welcome-flow";
import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { planOf } from "@/lib/plans";
import { primaryTruck } from "@/lib/fleet";
import { getWebDictionary } from "@/lib/i18n/dictionaries";
import { getAppLocale } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).onboarding.metadataTitle };
}

/**
 * Post-signup setup.
 *
 * Deliberately outside the app shell: on a first run the sidebar offers
 * Settlements, Reserves and Analytics before the owner has entered anything,
 * which is noise at exactly the moment they should be answering three
 * questions. Existing businesses that reach this route directly can leave it
 * without changing anything; normal edits belong on Settings and Truck.
 */
export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const [session, locale] = await Promise.all([requireSession(), getAppLocale()]);
  const { business, trucks, settings, goals, subscription } = await getRepository(
    session.businessId,
  ).getDataset();

  return (
    <div className="min-h-dvh bg-background">
      <WelcomeFlow
        business={business}
        truck={primaryTruck(trucks)}
        settings={settings}
        goals={goals}
        planName={planOf(subscription).name}
        locale={locale}
      />
    </div>
  );
}
