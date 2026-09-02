import type { Metadata } from "next";
import Link from "next/link";
import { Database, FileText, Users } from "lucide-react";

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
import { BrandLogo } from "@/components/shell/brand-logo";
import { CurrentPlanCard } from "@/components/subscription/current-plan-card";
import { TeamManager } from "@/components/team/team-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { summarizePeriod } from "@/lib/calculations";
import { getAuthStore, getRepository, storageMode } from "@/lib/db";
import { appText, type AppLocale } from "@/lib/i18n";
import { getAppLocale } from "@/lib/i18n-server";
import { periodFromSearchParams, param, type SearchParams } from "@/lib/period-params";
import { hasFleetAccess } from "@/lib/plans";
import { roleCan } from "@/lib/roles";
import { todayISO } from "@/lib/periods";
import { APP_NAME } from "@/lib/utils";

export const metadata: Metadata = { title: "Settings" };

const SECTION_COPY: Record<
  SettingsSection,
  { titleEn: string; titleEs: string; descriptionEn: string; descriptionEs: string }
> = {
  profile: {
    titleEn: "My profile",
    titleEs: "Mi perfil",
    descriptionEn: "Your personal sign-in and role in this workspace.",
    descriptionEs: "Tu inicio de sesión y tu rol en este negocio.",
  },
  app: {
    titleEn: "App preferences",
    titleEs: "Preferencias de la app",
    descriptionEn: "Language and display choices for this device.",
    descriptionEs: "Idioma y apariencia para este dispositivo.",
  },
  business: {
    titleEn: "Business & finances",
    titleEs: "Negocio y finanzas",
    descriptionEn: "Company identity, financial defaults, goals, and operating thresholds.",
    descriptionEs: "Identidad del negocio, reglas financieras, metas y alertas operativas.",
  },
  plan: {
    titleEn: "Plan & billing",
    titleEs: "Plan y facturación",
    descriptionEn: "Your subscription, limits, and paid features.",
    descriptionEs: "Tu suscripción, límites y funciones pagadas.",
  },
  access: {
    titleEn: "Access & roles",
    titleEs: "Acceso y roles",
    descriptionEn: "Control who can sign in and what each person can do.",
    descriptionEs: "Controla quién puede entrar y qué puede hacer cada persona.",
  },
  data: {
    titleEn: "Data & account",
    titleEs: "Datos y cuenta",
    descriptionEn: "Storage details and permanent account operations.",
    descriptionEs: "Almacenamiento y operaciones permanentes de la cuenta.",
  },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [session, locale] = await Promise.all([requireSession(), getAppLocale()]);
  const role = session.role ?? "VIEWER";
  const owner = role === "OWNER";
  const section = settingsSection(param(params, "section") || undefined, owner);
  const repository = getRepository(session.businessId);
  const [dataset, currentUser] = await Promise.all([
    repository.getDataset(),
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
  const heading = SECTION_COPY[section];

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <PageHeader
        title={appText(locale, "Settings", "Configuración")}
        description={appText(
          locale,
          "Personal preferences and business controls now live in separate sections.",
          "Las preferencias personales y los controles del negocio están separados.",
        )}
      />

      <div className="grid items-start gap-4 xl:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="xl:sticky xl:top-20">
          <SettingsNavigation current={section} locale={locale} owner={owner} />
        </div>

        <div className="min-w-0 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">
              {locale === "es" ? heading.titleEs : heading.titleEn}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {locale === "es" ? heading.descriptionEs : heading.descriptionEn}
            </p>
          </div>

          {section === "profile" ? (
            <ProfileSettings
              name={currentUser?.name ?? null}
              email={session.email}
              role={role}
              locale={locale}
            />
          ) : null}

          {section === "app" ? <DisplaySettings /> : null}

          {section === "business" ? (
            <>
              {owner ? (
                <SettingsForm
                  business={business}
                  settings={settings}
                  preview={preview}
                  previewLabel={period.label}
                  reserveAccounts={reserveAccounts}
                />
              ) : (
                <Card>
                  <CardHeader><CardTitle>Owner financial settings</CardTitle></CardHeader>
                  <CardContent className="p-4 text-sm leading-relaxed text-muted-foreground">
                    Reserve rules and owner financial settings are visible only to the workspace
                    owner.
                  </CardContent>
                </Card>
              )}
              {canManageBusiness ? <GoalsForm goals={goals} /> : null}
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
                  {appText(
                    locale,
                    "App sign-ins are for ongoing collaboration. Adding a driver never creates app access.",
                    "Los accesos son para colaborar en la aplicación. Agregar un chofer nunca crea una cuenta de acceso.",
                  )}
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
                    <p>Multiple sign-ins and role-based access are included with OnRoad Fleet.</p>
                    {owner ? (
                      <Button asChild size="sm"><Link href="/plans">View Fleet plan</Link></Button>
                    ) : (
                      <p className="font-medium text-foreground">Ask the owner about Fleet access.</p>
                    )}
                  </CardContent>
                </Card>
              )}
            </section>
          ) : null}

          {section === "data" && owner ? (
            <DataAndAccount locale={locale} email={session.email} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DataAndAccount({ locale, email }: { locale: AppLocale; email: string }) {
  const mode = storageMode();
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="size-3.5 text-muted-foreground" />
              <CardTitle>{appText(locale, "Data source", "Fuente de datos")}</CardTitle>
            </div>
            <Badge variant={mode === "postgres" ? "positive" : "info"}>
              {mode === "postgres" ? "PostgreSQL" : "Local JSON"}
            </Badge>
          </CardHeader>
          <CardContent className="p-4 text-xs leading-relaxed text-muted-foreground">
            {mode === "postgres"
              ? appText(
                  locale,
                  "Your business has an isolated PostgreSQL workspace. Every record is scoped to this company on the server.",
                  "Tu negocio tiene un espacio aislado en PostgreSQL. Cada registro pertenece únicamente a esta empresa.",
                )
              : "Local development data is stored in data/onroad-books.json."}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="size-3.5 text-muted-foreground" />
              <CardTitle>{appText(locale, "Product identity", "Identidad del producto")}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-4 text-xs leading-relaxed text-muted-foreground">
            <BrandLogo className="max-w-[13rem]" />
            <p>{APP_NAME} · Bookkeeping Built for the Road.</p>
          </CardContent>
        </Card>
      </div>
      <AccountDangerZone email={email} />
    </div>
  );
}
