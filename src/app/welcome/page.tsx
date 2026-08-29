import type { Metadata } from "next";

import { WelcomeFlow } from "@/components/onboarding/welcome-flow";
import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { planOf } from "@/lib/plans";
import { primaryTruck } from "@/lib/fleet";

export const metadata: Metadata = { title: "Welcome" };

/**
 * Post-signup setup.
 *
 * Deliberately outside the app shell: on a first run the sidebar offers
 * Settlements, Reserves and Analytics before the owner has entered anything,
 * which is noise at exactly the moment they should be answering three
 * questions. Reachable again at any time from Settings, because someone who
 * skipped it should be able to come back rather than hunt for the same fields
 * spread across two pages.
 */
export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const session = await requireSession();
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
      />
    </div>
  );
}
