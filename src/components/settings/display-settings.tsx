"use client";

import { Globe2, Monitor, Moon, Sun } from "lucide-react";

import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UI_SCALES, useTheme, type UiScale } from "@/components/shell/theme-provider";
import { useLanguage } from "@/components/shell/language-provider";
import { APP_LOCALES } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Display preferences live in the browser, not the database -- they are per
 * device, not per business, so two people on the same books can each read the
 * console the way they want.
 */
export function DisplaySettings() {
  const { theme, setTheme, scale, setScale } = useTheme();
  const { locale, setLocale, copy, dictionary } = useLanguage();
  const settingsCopy = dictionary.settings;
  const scaleCopy: Record<UiScale, { label: string; hint: string }> = {
    compact: { label: settingsCopy.compact, hint: settingsCopy.compactHint },
    default: { label: settingsCopy.defaultScale, hint: settingsCopy.defaultScaleHint },
    large: { label: settingsCopy.large, hint: settingsCopy.largeHint },
    xlarge: { label: settingsCopy.largest, hint: settingsCopy.largestHint },
  };

  return (
    <section className="rounded-lg border border-border bg-card">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Monitor className="size-4 text-muted-foreground" />
          <CardTitle>{settingsCopy.appTitle}</CardTitle>
        </div>
        <span className="text-2xs text-muted-foreground">
          {settingsCopy.savedDevice}
        </span>
      </CardHeader>

      <CardContent className="space-y-4 p-4">
        <div>
          <p className="label-xs">{copy.theme}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-sm">
            {(
              [
                { id: "dark", label: copy.dark, icon: Moon },
                { id: "light", label: copy.light, icon: Sun },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={theme === option.id}
                onClick={() => setTheme(option.id)}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  theme === option.id
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <option.icon className="size-4" />
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="label-xs">{copy.textSize}</p>
          <p className="mt-1 text-2xs text-muted-foreground">
            {settingsCopy.textScaleDescription}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {UI_SCALES.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={scale === option.id}
                onClick={() => setScale(option.id as UiScale)}
                className={cn(
                  "rounded-md border px-3 py-2 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  scale === option.id
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-accent/40",
                )}
              >
                <span
                  className={cn(
                    "block font-medium",
                    scale === option.id ? "text-foreground" : "text-muted-foreground",
                  )}
                  style={{ fontSize: `${option.value * 0.875}rem` }}
                >
                  {scaleCopy[option.id].label}
                </span>
                <span className="mt-0.5 block text-2xs text-muted-foreground">{scaleCopy[option.id].hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5">
            <Globe2 className="size-3.5 text-muted-foreground" />
            <p className="label-xs">{copy.language}</p>
          </div>
          <p className="mt-1 text-2xs text-muted-foreground">
            {settingsCopy.languageDescription}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-sm">
            {APP_LOCALES.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={locale === option.id}
                onClick={() => setLocale(option.id)}
                className={cn(
                  "rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  locale === option.id
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="mr-2 text-2xs font-semibold">{option.shortLabel}</span>
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </section>
  );
}
