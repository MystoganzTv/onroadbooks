"use client";

import { Check, Monitor, Moon, Sun, Type } from "lucide-react";

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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Display settings"
          title="Theme and text size"
          className={cn(
            "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-strong",
            className,
          )}
        >
          <Monitor />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="bottom" className="w-[13rem]">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        {(
          [
            { id: "dark", label: "Dark", icon: Moon },
            { id: "light", label: "Light", icon: Sun },
          ] as const
        ).map((option) => (
          <DropdownMenuItem
            key={option.id}
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
          Text size
        </DropdownMenuLabel>
        {UI_SCALES.map((option) => (
          <DropdownMenuItem
            key={option.id}
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
