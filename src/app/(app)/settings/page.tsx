import type { Metadata } from "next";
import { Database, FileText } from "lucide-react";

import { DisplaySettings } from "@/components/settings/display-settings";
import { AccountDangerZone } from "@/components/settings/account-danger-zone";
import { GoalsForm } from "@/components/settings/goals-form";
import { SettingsForm } from "@/components/settings/settings-form";
import { PageHeader } from "@/components/shared/page-header";
import { BrandLogo } from "@/components/shell/brand-logo";
import { CurrentPlanCard } from "@/components/subscription/current-plan-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { summarizePeriod } from "@/lib/calculations";
import { requireSession } from "@/lib/auth";
import { getRepository, storageMode } from "@/lib/db";
import { periodFromSearchParams, type SearchParams } from "@/lib/period-params";
import { todayISO } from "@/lib/periods";
import { APP_NAME } from "@/lib/utils";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const session = await requireSession();
  const { business, settings, goals, subscription, loads, expenses, reserveAccounts } =
    await getRepository(session.businessId).getDataset();
  const period = periodFromSearchParams(params);
  const preview = summarizePeriod(loads, expenses, period, settings);
  const mode = storageMode();

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title="Business Settings"
        description="Reserve percentages, targets and expense classification apply to every period in the app."
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <SettingsForm
            business={business}
            settings={settings}
            preview={preview}
            previewLabel={period.label}
            reserveAccounts={reserveAccounts}
          />

          <div className="mt-4">
            <GoalsForm goals={goals} />
          </div>

          <div className="mt-4">
            <DisplaySettings />
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <CurrentPlanCard
            subscription={subscription}
            today={todayISO()}
            canManage={(session.role ?? "VIEWER") === "OWNER"}
          />

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Database className="size-3.5 text-muted-foreground" />
                <CardTitle>Data Source</CardTitle>
              </div>
              <Badge variant={mode === "postgres" ? "positive" : "info"}>
                {mode === "postgres" ? "PostgreSQL" : "Local JSON"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-2 p-4 text-xs leading-relaxed text-muted-foreground">
              {mode === "postgres" ? (
                <p>
                  Your account has its own isolated business workspace in PostgreSQL. Every load,
                  expense, truck and document is scoped to that workspace on the server.
                </p>
              ) : (
                <>
                  <p>
                    Running on the bundled local store. Everything you add is written to{" "}
                    <code className="rounded bg-surface-sunken px-1">data/onroad-books.json</code>{" "}
                    and survives restarts.
                  </p>
                  <p>
                    To move to Supabase or any Postgres: set{" "}
                    <code className="rounded bg-surface-sunken px-1">DATABASE_URL</code>, set{" "}
                    <code className="rounded bg-surface-sunken px-1">DATA_SOURCE=postgres</code>,
                    then run{" "}
                    <code className="rounded bg-surface-sunken px-1">npm run db:push</code> and{" "}
                    <code className="rounded bg-surface-sunken px-1">npm run db:seed</code>. No
                    application code changes.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="size-3.5 text-muted-foreground" />
                <CardTitle>Brand</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-4 text-xs leading-relaxed text-muted-foreground">
              <BrandLogo className="max-w-[13rem]" />
              <p>
                The product is branded as{" "}
                <span className="font-medium text-foreground">{APP_NAME}</span>, with the tagline
                &ldquo;Bookkeeping Built for the Road.&rdquo; The displayed name comes from{" "}
                <code className="rounded bg-surface-sunken px-1">NEXT_PUBLIC_APP_NAME</code>.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {(session.role ?? "VIEWER") === "OWNER" ? (
        <AccountDangerZone email={session.email} />
      ) : null}
    </div>
  );
}
