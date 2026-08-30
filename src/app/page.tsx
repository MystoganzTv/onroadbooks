import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LandingPage } from "@/components/marketing/landing-page";
import { getSession } from "@/lib/auth";
import { LANDING_COPY } from "@/lib/marketing/copy";
import { display, script } from "@/lib/marketing/fonts";

// Reads the account state and the session cookie, so it must never be
// prerendered -- a build-time render would bake in "no account exists yet",
// and a signed-in owner would be shown the sales page instead of the cockpit.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // The landing page is the one route that carries its own full title rather
  // than the "%s | OnRoad Books" template.
  title: { absolute: LANDING_COPY.en.meta.title },
  description: LANDING_COPY.en.meta.description,
};

export default async function Home() {
  // Signed in: there is nothing to sell, go to work.
  if (await getSession()) redirect("/dashboard");

  // The two landing-only faces are attached here, so the app bundle never
  // pays for them.
  return (
    <div className={`${display.variable} ${script.variable}`}>
      <LandingPage primaryHref="/setup" />
    </div>
  );
}
