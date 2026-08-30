import type { Metadata } from "next";

import { PlanCard } from "@/components/settings/plan-card";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { activeTrucks } from "@/lib/fleet";
import { todayISO } from "@/lib/periods";

export const metadata: Metadata = { title: "Plans & Billing" };

export default async function PlansPage() {
  const session = await requireSession();
  const { subscription, trucks } = await getRepository(session.businessId).getDataset();

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <PageHeader
        title="Plans & Billing"
        description="Choose the right service for one truck, or request the separate Fleet workspace."
      />
      <div className="mx-auto max-w-5xl">
        <PlanCard
          subscription={subscription}
          activeTruckCount={activeTrucks(trucks).length}
          today={todayISO()}
        />
      </div>
    </div>
  );
}
