import { AppShell } from "@/components/shell/app-shell";
import { getRepository } from "@/lib/db";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { business, truck } = await getRepository().getDataset();

  return (
    <AppShell businessName={business.name} truckName={truck.name}>
      {children}
    </AppShell>
  );
}
