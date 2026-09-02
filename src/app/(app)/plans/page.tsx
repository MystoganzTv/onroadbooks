import type { Metadata } from "next";

import { PlanCard } from "@/components/settings/plan-card";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { todayISO } from "@/lib/periods";
import { stripeBillingConfigured } from "@/lib/stripe";
import { planOf } from "@/lib/plans";
import { getWebDictionary } from "@/lib/i18n/dictionaries";
import { getAppLocale } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).plans.metadataTitle };
}

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; billing?: string }>;
}) {
  const [params, session, locale] = await Promise.all([
    searchParams,
    requireSession(),
    getAppLocale(),
  ]);
  const copy = getWebDictionary(locale).plans;
  const { subscription } = await getRepository(session.businessId).getDataset();

  if ((session.role ?? "VIEWER") !== "OWNER") {
    return (
      <div className="space-y-5 p-4 lg:p-6">
        <PageHeader title={copy.title} description={copy.memberDescription} />
        <Card className="mx-auto max-w-2xl">
          <CardContent className="space-y-2 p-6">
            <p className="text-sm font-semibold">{planOf(subscription).name}</p>
            <p className="text-sm text-muted-foreground">{copy.ownerOnly}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
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
