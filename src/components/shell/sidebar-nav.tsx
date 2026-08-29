"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { BrandLogo } from "./brand-logo";
import { DisplayMenu } from "./display-menu";
import { PRIMARY_NAV } from "./nav-items";

interface SidebarNavProps {
  businessName: string;
  truckName: string;
  onNavigate?: () => void;
}

export function SidebarNav({ businessName, truckName, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const settingsActive = pathname === "/settings" || pathname.startsWith("/settings/");

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

      <nav className="flex-1 overflow-y-auto p-2" aria-label="Main">
        <ul className="space-y-0.5">
          {PRIMARY_NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
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
                    className={cn("size-4.5 shrink-0", active ? "text-primary" : "opacity-70")}
                  />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
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
            <p className="truncate text-sm font-medium text-sidebar-strong">{businessName}</p>
            <p className="truncate text-2xs text-sidebar-foreground">Business Settings</p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-sidebar-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
