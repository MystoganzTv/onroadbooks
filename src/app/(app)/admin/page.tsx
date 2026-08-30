import type { Metadata } from "next";
import { CreditCard, Database, ShieldCheck, Users } from "lucide-react";

import { AdminAccountsTable } from "@/components/admin/admin-accounts-table";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdminSession } from "@/lib/auth/admin";
import { getAuthStore, storageMode } from "@/lib/db";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  await requireAdminSession();
  const accounts = await getAuthStore().listAccounts();
  const customers = accounts.filter((account) => !account.isDemo);
  const active = customers.filter((account) => account.subscriptionStatus === "ACTIVE").length;
  const trials = customers.filter((account) => account.subscriptionStatus === "TRIALING").length;
  const connected = customers.filter((account) => account.hasProviderSubscription).length;

  const metrics = [
    { label: "Owner accounts", value: customers.length, note: `${accounts.length} including demo`, icon: Users, tone: "text-info" },
    { label: "Trials", value: trials, note: "Currently evaluating", icon: ShieldCheck, tone: "text-primary" },
    { label: "Active plans", value: active, note: `${connected} Stripe connected`, icon: CreditCard, tone: "text-pos" },
    { label: "Data source", value: storageMode() === "postgres" ? "Postgres" : "JSON", note: "Server-side account index", icon: Database, tone: "text-muted-foreground" },
  ];

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title="Admin Control Center"
        description="Monitor new owners, subscription state, and account data from one protected workspace."
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

      <AdminAccountsTable accounts={accounts} />
    </div>
  );
}
