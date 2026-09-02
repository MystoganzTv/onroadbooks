"use client";

import { Check, Globe2, Moon, Sun, Type } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { APP_LOCALES } from "@/lib/i18n";
import { useLanguage } from "./language-provider";
import { UI_SCALES, useTheme, type UiScale } from "./theme-provider";

/**
 * Theme and interface scale behind one icon.
 *
 * Display preferences are set rarely, so they get a single quiet affordance in
 * the sidebar header rather than a permanent widget competing with the
 * navigation. The same controls are mirrored in Settings > Display.
 */
export function DisplayMenu({ className }: { className?: string }) {
  const { theme, setTheme, scale, setScale } = useTheme();
  const { locale, setLocale, copy } = useLanguage();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={copy.displaySettings}
          title={copy.displayTitle}
          className={cn(
            "h-8 gap-1.5 px-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-strong",
            className,
          )}
        >
          <Globe2 />
          <span className="text-2xs font-semibold">{locale.toUpperCase()}</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="bottom" className="w-[13rem]">
        <DropdownMenuLabel>{copy.theme}</DropdownMenuLabel>
        {(
          [
            { id: "dark", label: copy.dark, icon: Moon },
            { id: "light", label: copy.light, icon: Sun },
          ] as const
        ).map((option) => (
          <DropdownMenuItem
            key={option.id}
            // The tick is decorative, so the state is spelled out for
            // assistive tech as well: these are one-of-N choices, not actions.
            role="menuitemradio"
            aria-checked={theme === option.id}
            onSelect={() => setTheme(option.id)}
            className="cursor-pointer"
          >
            <option.icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1">{option.label}</span>
            {theme === option.id ? <Check className="size-4 shrink-0" /> : null}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="flex items-center gap-1.5">
          <Type className="size-3" />
          {copy.textSize}
        </DropdownMenuLabel>
        {UI_SCALES.map((option) => (
          <DropdownMenuItem
            key={option.id}
            role="menuitemradio"
            aria-checked={scale === option.id}
            onSelect={() => setScale(option.id as UiScale)}
            className="cursor-pointer"
          >
            <span className="flex-1">
              <span className="block">{option.label}</span>
              <span className="block text-2xs text-muted-foreground">{option.hint}</span>
            </span>
            {scale === option.id ? <Check className="size-4 shrink-0" /> : null}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="flex items-center gap-1.5">
          <Globe2 className="size-3" />
          {copy.language}
        </DropdownMenuLabel>
        {APP_LOCALES.map((option) => (
          <DropdownMenuItem
            key={option.id}
            role="menuitemradio"
            aria-checked={locale === option.id}
            onSelect={() => setLocale(option.id)}
            className="cursor-pointer"
          >
            <span className="w-6 text-2xs font-semibold text-muted-foreground">
              {option.shortLabel}
            </span>
            <span className="flex-1">{option.label}</span>
            {locale === option.id ? <Check className="size-4 shrink-0" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
