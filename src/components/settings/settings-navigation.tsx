import Link from "next/link";
import {
  Building2,
  CreditCard,
  Database,
  MonitorCog,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { AppLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type SettingsSection =
  | "profile"
  | "app"
  | "business"
  | "plan"
  | "access"
  | "data";

interface SettingsNavigationProps {
  current: SettingsSection;
  locale: AppLocale;
  owner: boolean;
}

interface SectionOption {
  id: SettingsSection;
  icon: LucideIcon;
  en: string;
  es: string;
  descriptionEn: string;
  descriptionEs: string;
  ownerOnly?: boolean;
}

const SECTIONS: SectionOption[] = [
  {
    id: "profile",
    icon: UserRound,
    en: "My profile",
    es: "Mi perfil",
    descriptionEn: "Your sign-in and role",
    descriptionEs: "Tu sesión y nivel de acceso",
  },
  {
    id: "app",
    icon: MonitorCog,
    en: "App preferences",
    es: "Preferencias de la app",
    descriptionEn: "Language, theme, and text size",
    descriptionEs: "Idioma, tema y tamaño de texto",
  },
  {
    id: "business",
    icon: Building2,
    en: "Business & finances",
    es: "Negocio y finanzas",
    descriptionEn: "Defaults, goals, and thresholds",
    descriptionEs: "Reglas, metas y alertas",
  },
  {
    id: "plan",
    icon: CreditCard,
    en: "Plan & billing",
    es: "Plan y facturación",
    descriptionEn: "Subscription and paid features",
    descriptionEs: "Suscripción y funciones pagadas",
  },
  {
    id: "access",
    icon: Users,
    en: "Access & roles",
    es: "Acceso y roles",
    descriptionEn: "People who can sign in",
    descriptionEs: "Personas que pueden entrar",
  },
  {
    id: "data",
    icon: Database,
    en: "Data & account",
    es: "Datos y cuenta",
    descriptionEn: "Storage, reset, and deletion",
    descriptionEs: "Almacenamiento, reinicio y eliminación",
    ownerOnly: true,
  },
];

export function SettingsNavigation({ current, locale, owner }: SettingsNavigationProps) {
  return (
    <nav
      aria-label={locale === "es" ? "Secciones de configuración" : "Settings sections"}
      className="rounded-lg border border-border bg-card p-2"
    >
      <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-1">
        {SECTIONS.filter((section) => owner || !section.ownerOnly).map((section) => {
          const active = current === section.id;
          return (
            <li key={section.id}>
              <Link
                href={`/settings?section=${section.id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 items-start gap-3 rounded-md px-3 py-2.5 transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <section.icon className={cn("mt-0.5 size-4 shrink-0", active && "text-primary")} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {locale === "es" ? section.es : section.en}
                  </span>
                  <span className="mt-0.5 block text-2xs leading-snug text-muted-foreground">
                    {locale === "es" ? section.descriptionEs : section.descriptionEn}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function settingsSection(value: string | undefined, owner: boolean): SettingsSection {
  const valid: SettingsSection[] = ["profile", "app", "business", "plan", "access", "data"];
  if (!value || !valid.includes(value as SettingsSection)) return "profile";
  if (value === "data" && !owner) return "profile";
  return value as SettingsSection;
}

