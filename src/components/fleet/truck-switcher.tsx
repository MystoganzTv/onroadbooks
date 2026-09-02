"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Check, Truck as TruckIcon } from "lucide-react";

import type { Truck } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/shell/language-provider";

/**
 * Which unit a page is scoped to.
 *
 * State lives in the URL beside the period, so every server component on the
 * page recomputes from the same scope and the view stays shareable. Rendered
 * only when there is more than one truck -- a single-truck business should
 * never see a control that does nothing.
 */
export function TruckSwitcher({
  trucks,
  selectedId,
  allLabel,
  includeAll = true,
  variant = "compact",
  className,
}: {
  trucks: Truck[];
  selectedId: string | null;
  allLabel?: string;
  /**
   * Whether "the whole fleet" is a thing this page can show. It is not on a
   * page that reports one odometer at a time, and offering an option that
   * silently falls back to a single unit is worse than not offering it.
   */
  includeAll?: boolean;
  /** Cards make the current unit unmistakable on the truck workspace. */
  variant?: "compact" | "cards";
  className?: string;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const { locale } = useLanguage();
  const resolvedAllLabel = allLabel ?? (locale === "es" ? "Toda la flota" : "Whole fleet");

  if (trucks.length < 2) return null;

  const href = (id: string | null) => {
    const params = new URLSearchParams(search.toString());
    if (id) params.set("truck", id);
    else params.delete("truck");
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const compactOption = (id: string | null, label: string, inactive = false) => {
    const active = selectedId === id;
    return (
      <Link
        key={id ?? "all"}
        href={href(id)}
        aria-current={active ? "true" : undefined}
        className={cn(
          "rounded px-2.5 py-1 text-xs font-medium transition-colors focus-ring",
          active
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
          inactive && !active && "opacity-60",
        )}
      >
        {label}
      </Link>
    );
  };

  if (variant === "cards") {
    return (
      <div
        className={cn("grid w-full gap-2 sm:grid-cols-2 xl:grid-cols-3", className)}
        role="group"
        aria-label="Choose a truck"
      >
        {trucks.map((truck) => {
          const active = selectedId === truck.id;
          const description = [truck.year, truck.make, truck.model].filter(Boolean).join(" ");

          return (
            <Link
              key={truck.id}
              href={href(truck.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex min-w-0 items-center gap-3 rounded-lg border p-3 text-left transition-colors focus-ring",
                active
                  ? "border-primary bg-primary/10 shadow-sm"
                  : "border-border bg-card hover:border-primary/50 hover:bg-accent/50",
                !truck.active && !active && "opacity-70",
              )}
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-md border",
                  active
                    ? "border-primary/30 bg-primary text-primary-foreground"
                    : "border-border bg-surface-sunken text-muted-foreground group-hover:text-foreground",
                )}
                aria-hidden
              >
                <TruckIcon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">{truck.name}</span>
                  {!truck.active ? (
                    <span className="rounded border border-border px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
                      Retired
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate text-2xs text-muted-foreground">
                  {description || "Vehicle details not added"}
                </span>
              </span>
              {active ? (
                <span
                  className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  aria-label="Currently viewing"
                  title="Currently viewing"
                >
                  <Check className="size-3" />
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex min-h-8 flex-wrap items-center gap-0.5 rounded-md border border-border bg-surface-sunken p-0.5 print:hidden",
        className,
      )}
      role="group"
      aria-label="Truck"
    >
      <span className="px-1.5 text-muted-foreground" aria-hidden>
        <TruckIcon className="size-3.5" />
      </span>
      {includeAll ? compactOption(null, resolvedAllLabel) : null}
      {trucks.map((truck) => compactOption(truck.id, truck.name, !truck.active))}
    </div>
  );
}
