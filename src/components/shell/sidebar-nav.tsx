"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ChevronDown, ChevronRight, LogOut } from "lucide-react";

import { cn } from "@/lib/utils";
import { BrandLogo } from "./brand-logo";
import { DisplayMenu } from "./display-menu";
import {
  isNavActive,
  isNavVisibleToRole,
  navAvailability,
  NAV_GROUPS,
  type NavigationReadiness,
} from "./nav-items";
import {
  getCollapsedGroups,
  getCollapsedGroupsOnServer,
  subscribeToCollapsedGroups,
  toggleGroup,
} from "./sidebar-groups";
import { ROLE_DEFINITIONS } from "@/lib/roles";
import type { MemberRole } from "@/lib/types";
import { useLanguage } from "./language-provider";
import { localizedNavGroup, localizedNavItem } from "./nav-copy";

interface SidebarNavProps {
  businessName: string;
  truckName: string;
  /** Fleet-only destinations stay hidden until paid Fleet access is active. */
  hasFleet?: boolean;
  isAdmin?: boolean;
  role?: MemberRole;
  readiness?: NavigationReadiness;
  onNavigate?: () => void;
}

export function SidebarNav({
  businessName,
  truckName,
  hasFleet = false,
  isAdmin = false,
  role = "VIEWER",
  readiness,
  onNavigate,
}: SidebarNavProps) {
  const pathname = usePathname();
  const { locale, copy } = useLanguage();
  const navId = React.useId();
  const settingsActive =
    pathname === "/settings" || pathname.startsWith("/settings/");
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        (hasFleet || !item.fleetOnly) &&
        (isAdmin || !item.adminOnly) &&
        isNavVisibleToRole(item, role),
    ),
  })).filter((group) => group.items.length > 0);
  // Every group is open until it is deliberately closed, and navigating never
  // reopens one. The nav used to force the active group open on every route
  // change, which meant a group you had just collapsed sprang back the moment
  // you clicked a link inside it.
  const collapsed = React.useSyncExternalStore(
    subscribeToCollapsedGroups,
    getCollapsedGroups,
    getCollapsedGroupsOnServer,
  );

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

      <nav className="flex-1 space-y-1 overflow-y-auto p-2" aria-label={copy.mainNavigation}>
        {visibleGroups.map((group) => {
          const expanded = !collapsed.includes(group.label);
          const holdsCurrentPage = group.items.some((item) =>
            isNavActive(item, pathname),
          );
          const groupId = `${navId}-${group.label.toLowerCase().replaceAll(" ", "-")}`;

          return (
            <div key={group.label}>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={groupId}
                onClick={() => toggleGroup(group.label)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-2xs font-semibold uppercase tracking-[0.14em] transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  expanded
                    ? "text-sidebar-strong"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-strong",
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">{localizedNavGroup(group.label, copy)}</span>
                  {holdsCurrentPage && !expanded ? (
                    <span
                      aria-hidden="true"
                      className="size-1.5 shrink-0 rounded-full bg-primary"
                    />
                  ) : null}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn(
                    "size-3.5 transition-transform",
                    expanded ? "rotate-180" : "rotate-0",
                  )}
                />
              </button>
              <ul id={groupId} hidden={!expanded} className="mt-0.5 space-y-0.5">
                {group.items.map((item) => {
                  const active = isNavActive(item, pathname);
                  const availability = navAvailability(item, readiness);
                  const content = (
                    <>
                      <item.icon
                        className={cn(
                          "size-4.5 shrink-0",
                          active ? "text-primary" : "opacity-70",
                        )}
                      />
                      <span className="truncate">
                        {localizedNavItem(item.href, item.label, copy)}
                      </span>
                      {!availability.enabled && availability.badge ? (
                        <span className="ml-auto shrink-0 rounded border border-sidebar-border px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide">
                          {availability.badge}
                        </span>
                      ) : null}
                    </>
                  );
                  return (
                    <li key={item.href}>
                      {availability.enabled ? (
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
                          {content}
                        </Link>
                      ) : (
                        <span
                          aria-disabled="true"
                          title={availability.reason}
                          className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-sidebar-foreground opacity-45"
                        >
                          {content}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
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
              {role === "OWNER"
                ? copy.businessSettings
                : locale === "es"
                  ? `Acceso ${ROLE_DEFINITIONS[role].label.toLowerCase()}`
                  : `${ROLE_DEFINITIONS[role].label} access`}
            </p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-sidebar-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>

        <div className="mt-1 flex justify-end px-2.5">
          <button
            type="button"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
            className="inline-flex min-h-11 items-center gap-1 rounded px-2.5 py-1 text-2xs text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <LogOut className="size-3" />
            {copy.signOut}
          </button>
        </div>
      </div>
    </div>
  );
}
