"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ChevronRight, LogOut } from "lucide-react";

import { cn } from "@/lib/utils";
import { BrandLogo } from "./brand-logo";
import { DisplayMenu } from "./display-menu";
import { isNavActive, NAV_GROUPS } from "./nav-items";

interface SidebarNavProps {
  businessName: string;
  truckName: string;
  /** Fleet-only destinations stay hidden until paid Fleet access is active. */
  hasFleet?: boolean;
  userEmail?: string;
  onNavigate?: () => void;
}

export function SidebarNav({
  businessName,
  truckName,
  hasFleet = false,
  userEmail,
  onNavigate,
}: SidebarNavProps) {
  const pathname = usePathname();
  const settingsActive =
    pathname === "/settings" || pathname.startsWith("/settings/");

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="shrink-0 border-b border-sidebar-border p-3">
        <BrandLogo priority />
        <div className="mt-2 flex items-center gap-2 px-1">
          <p className="min-w-0 flex-1 truncate text-xs font-medium text-sidebar-foreground">
            {truckName}
          </p>
          <DisplayMenu />
        </div>
      </div>

      <nav className="flex-1 space-y-3 overflow-y-auto p-2" aria-label="Main">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-2.5 pb-1 text-2xs font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/60">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items
                .filter((item) => hasFleet || !item.fleetOnly)
                .map((item) => {
                  const active = isNavActive(item, pathname);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                          active
                            ? "bg-sidebar-accent text-sidebar-strong"
                            : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-strong",
                        )}
                      >
                        <item.icon
                          className={cn(
                            "size-4.5 shrink-0",
                            active ? "text-primary" : "opacity-70",
                          )}
                        />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-2">
        <Link
          href="/settings"
          onClick={onNavigate}
          aria-current={settingsActive ? "page" : undefined}
          className={cn(
            "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            settingsActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
          )}
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded border border-sidebar-border bg-sidebar-accent text-sidebar-foreground">
            <Building2 className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-sidebar-strong">
              {businessName}
            </p>
            <p className="truncate text-2xs text-sidebar-foreground">
              Business Settings
            </p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-sidebar-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>

        <div className="mt-1 flex items-center gap-2 px-2.5">
          <span className="min-w-0 flex-1 truncate text-2xs text-sidebar-foreground">
            {userEmail}
          </span>
          <button
            type="button"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
            className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-2xs text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <LogOut className="size-3" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
