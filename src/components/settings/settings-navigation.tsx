import Link from "next/link";
import {
  Building2,
  CreditCard,
  MonitorCog,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { AppLocale } from "@/lib/i18n";
import { getWebDictionary } from "@/lib/i18n/dictionaries";
import { cn } from "@/lib/utils";

export type SettingsSection =
  | "profile"
  | "app"
  | "business"
  | "plan"
  | "access";

interface SettingsNavigationProps {
  current: SettingsSection;
  locale: AppLocale;
}

interface SectionOption {
  id: SettingsSection;
  icon: LucideIcon;
}

const SECTIONS: SectionOption[] = [
  {
    id: "profile",
    icon: UserRound,
  },
  {
    id: "app",
    icon: MonitorCog,
  },
  {
    id: "business",
    icon: Building2,
  },
  {
    id: "plan",
    icon: CreditCard,
  },
  {
    id: "access",
    icon: Users,
  },
];

export function SettingsNavigation({ current, locale }: SettingsNavigationProps) {
  const copy = getWebDictionary(locale).settings;
  const labels: Record<SettingsSection, { title: string; description: string }> = {
    profile: { title: copy.profileTitle, description: copy.profileDescription },
    app: { title: copy.appTitle, description: copy.appDescription },
    business: { title: copy.businessTitle, description: copy.businessDescription },
    plan: { title: copy.planTitle, description: copy.planDescription },
    access: { title: copy.accessTitle, description: copy.accessDescription },
  };
  return (
    <nav
      aria-label={copy.sectionsAria}
      className="rounded-lg border border-border bg-card p-2"
    >
      <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-1">
        {SECTIONS.map((section) => {
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
                    {labels[section.id].title}
                  </span>
                  <span className="mt-0.5 block text-2xs leading-snug text-muted-foreground">
                    {labels[section.id].description}
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

export function settingsSection(value: string | undefined): SettingsSection {
  const valid: SettingsSection[] = ["profile", "app", "business", "plan", "access"];
  if (!value || !valid.includes(value as SettingsSection)) return "profile";
  return value as SettingsSection;
}
