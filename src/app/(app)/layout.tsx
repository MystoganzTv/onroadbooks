import { AppShell } from "@/components/shell/app-shell";
import { LanguageProvider } from "@/components/shell/language-provider";
import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { activeTrucks, primaryTruck } from "@/lib/fleet";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { hasFleetAccess } from "@/lib/plans";
import { fleetIftaApplicability } from "@/lib/ifta-eligibility";
import { getAppLocale } from "@/lib/i18n-server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [session, locale] = await Promise.all([requireSession(), getAppLocale()]);
  const dataset = await getRepository(session.businessId).getDataset();
  const {
    business,
    trucks,
    subscription,
    loads,
    expenses,
    paymentEvents,
    fuelEntries,
  } = dataset;

  // Fleet is a paid service, not a mode inferred from how many truck rows
  // happen to exist. A non-Fleet account always presents one primary unit.
  const running = activeTrucks(trucks);
  const hasFleet = hasFleetAccess(subscription);

  return (
    <LanguageProvider initialLocale={locale}>
      <AppShell
        businessName={business.name}
        truckName={
          !hasFleet || running.length === 0
            ? primaryTruck(trucks).name
            : running.length === 1
              ? running[0].name
              : locale === "es"
                ? `${running.length} camiones`
                : `${running.length} trucks`
        }
        hasFleet={hasFleet}
        isAdmin={isPlatformAdminEmail(session.email)}
        role={session.role ?? "VIEWER"}
        readiness={{
          hasLoads: loads.length > 0,
          hasFinancialActivity:
            loads.length > 0 || expenses.length > 0 || paymentEvents.length > 0,
          hasDriverPayActivity:
            dataset.drivers.length > 0 && loads.some((load) => Boolean(load.driverId)),
          hasIftaActivity:
            loads.some((load) => load.jurisdictionMiles.length > 0) ||
            fuelEntries.some((entry) => Boolean(entry.jurisdiction)),
          iftaApplicability: fleetIftaApplicability(running),
        }}
      >
        {children}
      </AppShell>
    </LanguageProvider>
  );
}
