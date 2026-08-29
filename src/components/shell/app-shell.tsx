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
import { isNavActive, PRIMARY_NAV } from "./nav-items";

interface AppShellProps {
  businessName: string;
  truckName: string;
  userEmail: string;
  children: React.ReactNode;
}

export function AppShell({ businessName, truckName, userEmail, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const pathname = usePathname();

  const current = PRIMARY_NAV.find((item) => isNavActive(item, pathname))?.label ?? APP_NAME;

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-sidebar-border lg:block">
        <SidebarNav businessName={businessName} truckName={truckName} userEmail={userEmail} />
      </aside>

      {/* Mobile drawer */}
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="left-0 top-0 h-dvh w-64 max-w-[80vw] translate-x-0 translate-y-0 grid-rows-1 rounded-none border-y-0 border-l-0 p-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left">
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <SidebarNav
            businessName={businessName}
            truckName={truckName}
            userEmail={userEmail}
            onNavigate={() => setMobileOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
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

        <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
