"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UI_SCALES, useTheme, type UiScale } from "@/components/shell/theme-provider";
import { cn } from "@/lib/utils";

/**
 * Display preferences live in the browser, not the database -- they are per
 * device, not per business, so two people on the same books can each read the
 * console the way they want.
 */
export function DisplaySettings() {
  const { theme, setTheme, scale, setScale } = useTheme();

  return (
    <section className="rounded-lg border border-border bg-card">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Monitor className="size-4 text-muted-foreground" />
          <CardTitle>Display</CardTitle>
        </div>
        <span className="text-2xs text-muted-foreground">Saved on this device</span>
      </CardHeader>

      <CardContent className="space-y-4 p-4">
        <div>
          <p className="label-xs">Theme</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-sm">
            {(
              [
                { id: "dark", label: "Dark", icon: Moon },
                { id: "light", label: "Light", icon: Sun },
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
          <p className="label-xs">Text size</p>
          <p className="mt-1 text-2xs text-muted-foreground">
            Scales the whole interface -- text, spacing, control heights and table rows -- not
            just the font.
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
                  {option.label}
                </span>
                <span className="mt-0.5 block text-2xs text-muted-foreground">{option.hint}</span>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </section>
  );
}
