import { AppShell } from "@/components/shell/app-shell";
import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { activeTrucks, primaryTruck } from "@/lib/fleet";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const { business, trucks } = await getRepository(session.businessId).getDataset();

  // The sidebar names the truck when only one is running, and counts them
  // when several are -- naming just the first would be a quiet lie. The Fleet
  // page stays reachable once a second unit has ever existed, because its
  // history still belongs in past periods even after it is retired.
  const running = activeTrucks(trucks);
  const hasFleet = trucks.length > 1;

  return (
    <AppShell
      businessName={business.name}
      truckName={
        // Retiring the last truck must not blank the sidebar, so fall back to
        // whatever unit the rest of the app treats as the primary one.
        running.length === 0
          ? primaryTruck(trucks).name
          : running.length === 1
            ? running[0].name
            : `${running.length} trucks`
      }
      hasFleet={hasFleet}
      userEmail={session.email}
      isDemo={session.isDemo}
    >
      {children}
    </AppShell>
  );
}
