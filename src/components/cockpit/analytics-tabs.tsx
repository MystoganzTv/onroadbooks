"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/shell/language-provider";

/** Sub-navigation for the intelligence pages; carries the period along. */
export function AnalyticsTabs() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const { dictionary } = useLanguage();
  const copy = dictionary.analytics;
  const tabs = [
    { href: "/analytics/cost-per-mile", label: copy.costTab },
    { href: "/analytics/brokers", label: copy.brokersTab },
    { href: "/analytics/lanes", label: copy.lanesTab },
  ];

  return (
    <nav className="flex gap-1 overflow-x-auto" aria-label={copy.analyticsSections}>
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={search ? `${tab.href}?${search}` : tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-ring",
              active
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
