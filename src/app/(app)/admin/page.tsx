import type { Metadata } from "next";
import { Activity, CreditCard, ShieldCheck, Users } from "lucide-react";

import { AdminAccountsTable } from "@/components/admin/admin-accounts-table";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdminPageSession } from "@/lib/auth/admin";
import { getAuthStore } from "@/lib/db";
import { isPlatformAdminEmail } from "@/lib/platform-admin";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  await requireAdminPageSession();
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
    { label: "Customer accounts", value: customers.length, note: `${joinedThisWeek} joined in the last 7 days`, icon: Users, tone: "text-info" },
    { label: "Engaged (30 days)", value: engaged, note: `${started} have started their books`, icon: Activity, tone: "text-primary" },
    { label: "Trials", value: trials, note: "Currently evaluating Pro", icon: ShieldCheck, tone: "text-primary" },
    { label: "Managed access", value: paid + complimentary, note: `${paid} Stripe · ${complimentary} complimentary`, icon: CreditCard, tone: "text-pos" },
  ];

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title="Admin Control Center"
        description="Monitor adoption, manage access, and support accounts without opening their private business records."
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
