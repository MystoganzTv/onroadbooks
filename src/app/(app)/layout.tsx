import { AppShell } from "@/components/shell/app-shell";
import { requireSession } from "@/lib/auth";
import { isAdminEmail } from "@/lib/auth/admin";
import { getRepository } from "@/lib/db";
import { activeTrucks, primaryTruck } from "@/lib/fleet";
import { hasFleetAccess } from "@/lib/plans";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const { business, trucks, subscription } = await getRepository(session.businessId).getDataset();

  // Fleet is a paid service, not a mode inferred from how many truck rows
  // happen to exist. A non-Fleet account always presents one primary unit.
  const running = activeTrucks(trucks);
  const hasFleet = hasFleetAccess(subscription);

  return (
    <AppShell
      businessName={business.name}
      truckName={
        !hasFleet || running.length === 0
          ? primaryTruck(trucks).name
          : running.length === 1
            ? running[0].name
            : `${running.length} trucks`
      }
      hasFleet={hasFleet}
      userEmail={session.email}
      isDemo={session.isDemo}
      isAdmin={isAdminEmail(session.email)}
    >
      {children}
    </AppShell>
  );
}
