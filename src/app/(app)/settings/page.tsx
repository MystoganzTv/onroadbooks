import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";

import { AccountDangerZone } from "@/components/settings/account-danger-zone";
import { DisplaySettings } from "@/components/settings/display-settings";
import { GoalsForm } from "@/components/settings/goals-form";
import { ProfileSettings } from "@/components/settings/profile-settings";
import {
  SettingsNavigation,
  settingsSection,
  type SettingsSection,
} from "@/components/settings/settings-navigation";
import { SettingsForm } from "@/components/settings/settings-form";
import { PageHeader } from "@/components/shared/page-header";
import { CurrentPlanCard } from "@/components/subscription/current-plan-card";
import { TeamManager } from "@/components/team/team-manager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { summarizePeriod } from "@/lib/calculations";
import { getAuthStore, getDataset } from "@/lib/db";
import { getWebDictionary } from "@/lib/i18n/dictionaries";
import { formatLocalePeriod } from "@/lib/i18n-format";
import { getAppLocale } from "@/lib/i18n-server";
import { periodFromSearchParams, param, type SearchParams } from "@/lib/period-params";
import { hasFleetAccess } from "@/lib/plans";
import { roleCan } from "@/lib/roles";
import { todayISO } from "@/lib/periods";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).settings.metadataTitle };
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [session, locale] = await Promise.all([requireSession(), getAppLocale()]);
  const dictionary = getWebDictionary(locale);
  const copy = dictionary.settings;
  const role = session.role ?? "VIEWER";
  const owner = role === "OWNER";
  const section = settingsSection(param(params, "section") || undefined);
  const [dataset, currentUser] = await Promise.all([
    getDataset(session.businessId),
    getAuthStore().findUserById(session.userId),
  ]);
  const {
    business,
    settings,
    goals,
    subscription,
    loads,
    expenses,
    reserveAccounts,
    paymentEvents,
  } = dataset;
  const period = periodFromSearchParams(params);
  const preview = summarizePeriod(loads, expenses, period, settings, paymentEvents);
  const canManageBusiness = roleCan(role, "manage_business");
  const hasFleet = hasFleetAccess(subscription);
  const members = section === "access" && hasFleet
    ? await getAuthStore().listMembers(session.businessId)
    : [];
  const headings: Record<SettingsSection, { title: string; description: string }> = {
    profile: { title: copy.profileTitle, description: copy.profileDescription },
    app: { title: copy.appTitle, description: copy.appDescription },
    business: { title: copy.businessTitle, description: copy.businessDescription },
    plan: { title: copy.planTitle, description: copy.planDescription },
    access: { title: copy.accessTitle, description: copy.accessDescription },
  };
  const heading = headings[section];

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
      />

      <div className="grid items-start gap-4 xl:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="xl:sticky xl:top-20">
          <SettingsNavigation current={section} locale={locale} />
        </div>

        <div className="min-w-0 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">
              {heading.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {heading.description}
            </p>
          </div>

          {section === "profile" ? (
            <>
              <ProfileSettings
                name={currentUser?.name ?? null}
                email={session.email}
                role={role}
                locale={locale}
              />
              {owner ? (
                <AccountDangerZone operation="delete" email={session.email} locale={locale} />
              ) : null}
            </>
          ) : null}

          {section === "app" ? <DisplaySettings /> : null}

          {section === "business" ? (
            <>
              {owner ? (
                <SettingsForm
                  business={business}
                  settings={settings}
                  preview={preview}
                  previewLabel={formatLocalePeriod(period, locale)}
                  reserveAccounts={reserveAccounts}
                />
              ) : (
                <Card>
                  <CardHeader><CardTitle>{copy.ownerFinancial}</CardTitle></CardHeader>
                  <CardContent className="p-4 text-sm leading-relaxed text-muted-foreground">
                    {copy.ownerFinancialDescription}
                  </CardContent>
                </Card>
              )}
              {canManageBusiness ? <GoalsForm goals={goals} /> : null}
              {owner ? (
                <AccountDangerZone operation="reset" email={session.email} locale={locale} />
              ) : null}
            </>
          ) : null}

          {section === "plan" ? (
            <div className="max-w-2xl">
              <CurrentPlanCard
                subscription={subscription}
                today={todayISO()}
                canManage={owner}
              />
            </div>
          ) : null}

          {section === "access" ? (
            <section id="access-roles" className="space-y-3">
              <div className="flex items-start gap-2 rounded-md border border-info/25 bg-info-soft p-3">
                <Users className="mt-0.5 size-4 shrink-0 text-info" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {copy.accessNotice}
                </p>
              </div>
              {hasFleet ? (
                <TeamManager
                  members={members.map(({ id, email, name, role: memberRole, joinedAt, invitedAt }) => ({
                    id,
                    email,
                    name,
                    role: memberRole,
                    joinedAt,
                    invitedAt,
                  }))}
                  canManage={roleCan(role, "manage_team")}
                />
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-start gap-3 p-5 text-sm text-muted-foreground">
                    <p>{copy.fleetAccess}</p>
                    {owner ? (
                      <Button asChild size="sm"><Link href="/plans">{copy.viewFleet}</Link></Button>
                    ) : (
                      <p className="font-medium text-foreground">{copy.askOwnerFleet}</p>
                    )}
                  </CardContent>
                </Card>
              )}
            </section>
          ) : null}

        </div>
      </div>
    </div>
  );
}
