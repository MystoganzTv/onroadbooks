import type { Metadata } from "next";

import { PlanCard } from "@/components/settings/plan-card";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { todayISO } from "@/lib/periods";
import { stripeBillingConfigured } from "@/lib/stripe";

export const metadata: Metadata = { title: "Plans & Billing" };

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; billing?: string }>;
}) {
  const params = await searchParams;
  const session = await requireSession();
  const { subscription } = await getRepository(session.businessId).getDataset();

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <PageHeader
        title="Plans & Billing"
        description="Choose the right service for one truck, or request the separate Fleet workspace."
      />
      <div className="mx-auto max-w-5xl">
        <PlanCard
          subscription={subscription}
          today={todayISO()}
          billingReady={stripeBillingConfigured()}
          checkoutState={params.checkout}
          billingState={params.billing}
        />
      </div>
    </div>
  );
}
