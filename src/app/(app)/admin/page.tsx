import type { Metadata } from "next";
import { Activity, CreditCard, ShieldCheck, Users } from "lucide-react";

import { AdminAccountsTable } from "@/components/admin/admin-accounts-table";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdminPageSession } from "@/lib/auth/admin";
import { getAuthStore } from "@/lib/db";
import { getWebDictionary, interpolate } from "@/lib/i18n/dictionaries";
import { getAppLocale } from "@/lib/i18n-server";
import { isPlatformAdminEmail } from "@/lib/platform-admin";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).admin.metadataTitle };
}

export default async function AdminPage() {
  const [, locale] = await Promise.all([requireAdminPageSession(), getAppLocale()]);
  const copy = getWebDictionary(locale).admin;
  const accounts = (await getAuthStore().listAccounts()).map((account) => ({
    ...account,
    isPlatformAdmin: isPlatformAdminEmail(account.email),
  }));
  const customers = accounts;
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const engaged = customers.filter((account) => {
    const timestamp = account.lastActivityAt ? Date.parse(account.lastActivityAt) : Number.NaN;
    return Number.isFinite(timestamp) && timestamp >= thirtyDaysAgo;
  }).length;
  const started = customers.filter((account) =>
    account.counts.loads + account.counts.expenses + account.counts.documents > 0,
  ).length;
  const joinedThisWeek = customers.filter((account) => Date.parse(account.createdAt) >= sevenDaysAgo).length;
  const trials = customers.filter((account) => account.subscriptionStatus === "TRIALING").length;
  const paid = customers.filter((account) => account.accessSource === "stripe").length;
  const complimentary = customers.filter((account) => account.accessSource === "complimentary").length;

  const metrics = [
    { label: copy.customerAccounts, value: customers.length, note: interpolate(copy.joinedLastSevenDays, { count: joinedThisWeek }), icon: Users, tone: "text-info" },
    { label: copy.engagedThirtyDays, value: engaged, note: interpolate(copy.startedBooks, { count: started }), icon: Activity, tone: "text-primary" },
    { label: copy.trials, value: trials, note: copy.evaluatingPro, icon: ShieldCheck, tone: "text-primary" },
    { label: copy.managedAccess, value: paid + complimentary, note: interpolate(copy.managedAccessNote, { paid, complimentary }), icon: CreditCard, tone: "text-pos" },
  ];

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardContent className="flex items-start justify-between gap-4 p-4">
              <div>
                <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{metric.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{metric.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{metric.note}</p>
              </div>
              <metric.icon className={`mt-0.5 size-5 ${metric.tone}`} />
            </CardContent>
          </Card>
        ))}
      </div>

      <AdminAccountsTable accounts={accounts} now={new Date(now).toISOString()} />
    </div>
  );
}
