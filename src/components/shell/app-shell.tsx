"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { APP_NAME } from "@/lib/utils";
import { BrandLogo } from "./brand-logo";
import { SidebarNav } from "./sidebar-nav";
import { DisplayMenu } from "./display-menu";
import { isNavActive, PRIMARY_NAV, type NavigationReadiness } from "./nav-items";
import type { MemberRole } from "@/lib/types";

interface AppShellProps {
  businessName: string;
  truckName: string;
  hasFleet?: boolean;
  isAdmin?: boolean;
  role?: MemberRole;
  readiness?: NavigationReadiness;
  children: React.ReactNode;
}

export function AppShell({
  businessName,
  truckName,
  hasFleet = false,
  isAdmin = false,
  role = "VIEWER",
  readiness,
  children,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const pathname = usePathname();

  const current = PRIMARY_NAV.find((item) => isNavActive(item, pathname))?.label ?? APP_NAME;

  return (
    <div className="flex min-h-dvh bg-background print:block print:min-h-0">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-sidebar-border lg:block">
        <SidebarNav
          businessName={businessName}
          truckName={truckName}
          hasFleet={hasFleet}
          isAdmin={isAdmin}
          role={role}
          readiness={readiness}
        />
      </aside>

      {/* Mobile drawer */}
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="left-0 top-0 h-dvh w-64 max-w-[80vw] translate-x-0 translate-y-0 grid-rows-1 rounded-none border-y-0 border-l-0 p-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left">
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <SidebarNav
            businessName={businessName}
            truckName={truckName}
            hasFleet={hasFleet}
            isAdmin={isAdmin}
            role={role}
            readiness={readiness}
            onNavigate={() => setMobileOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60 print:block">
        {role === "VIEWER" ? (
          <div className="border-b border-info/25 bg-info-soft px-4 py-2 text-center text-xs text-info print:hidden">
            <span className="font-semibold">Viewer access</span>
            <span> — this workspace is read-only for your role.</span>
          </div>
        ) : null}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </Button>
          <BrandLogo className="w-[7.5rem] shrink-0 px-1 py-0.5 shadow-none" priority />
          <span className="min-w-0 truncate text-base font-semibold">{current}</span>
          <div className="ml-auto">
            <DisplayMenu className="text-muted-foreground hover:bg-accent hover:text-foreground" />
          </div>
        </header>

        {/*
          * overflow-x-hidden makes the other axis compute to `auto`, which turns
          * this into a scroll container. On screen that is what stops a wide
          * table breaking the layout; in print it clips the document to one
          * page and throws the rest away, so it has to be undone on paper.
          */}
        <main className="min-w-0 flex-1 overflow-x-hidden print:overflow-visible">
          {children}
        </main>
      </div>
    </div>
  );
}
