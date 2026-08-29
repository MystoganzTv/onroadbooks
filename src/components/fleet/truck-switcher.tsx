"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Truck as TruckIcon } from "lucide-react";

import type { Truck } from "@/lib/types";
import { cn } from "@/lib/utils";

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
  allLabel = "Whole fleet",
  includeAll = true,
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
  className?: string;
}) {
  const pathname = usePathname();
  const search = useSearchParams();

  if (trucks.length < 2) return null;

  const href = (id: string | null) => {
    const params = new URLSearchParams(search.toString());
    if (id) params.set("truck", id);
    else params.delete("truck");
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const option = (id: string | null, label: string, inactive = false) => {
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
      {includeAll ? option(null, allLabel) : null}
      {trucks.map((truck) => option(truck.id, truck.name, !truck.active))}
    </div>
  );
}
