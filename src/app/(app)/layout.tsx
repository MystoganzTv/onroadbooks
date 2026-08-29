import { AppShell } from "@/components/shell/app-shell";
import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const { business, truck } = await getRepository(session.businessId).getDataset();

  return (
    <AppShell
      businessName={business.name}
      truckName={truck.name}
      userEmail={session.email}
    >
      {children}
    </AppShell>
  );
}
