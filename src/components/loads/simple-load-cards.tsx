"use client";

import Link from "next/link";
import { useLanguage } from "@/components/shell/language-provider";
import { formatMoney } from "@/lib/formatters";
import { formatLocaleDate } from "@/lib/i18n-format";
import type { LoadWithMetrics, Truck } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Keep both money figures visible on narrow screens without sideways scrolling. */
export function SimpleLoadCards({ loads, trucks = [], totals }: {
  loads: LoadWithMetrics[];
  trucks?: Truck[];
  totals?: { rate: number; profit: number };
}) {
  const { dictionary, locale } = useLanguage();
  return (
    <div className="sm:hidden">
      <ul aria-label={dictionary.loads.title} className="divide-y divide-border">
        {loads.map((load) => (
          <li key={load.id}>
            <Link href={`/loads/${load.id}`} className="block space-y-3 p-4 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              <div>
                <p className="text-xs text-muted-foreground">{formatLocaleDate(load.date, locale, "short")}</p>
                <p className="mt-1 break-words font-medium">{load.originCity}, {load.originState} → {load.destinationCity}, {load.destinationState}</p>
                <p className="mt-1 break-words text-xs text-muted-foreground">{[load.broker, load.loadNumber, trucks.length > 1 ? trucks.find((truck) => truck.id === load.truckId)?.name : null].filter(Boolean).join(" · ")}</p>
              </div>
              <dl className="grid grid-cols-2 gap-3">
                <div><dt className="text-xs text-muted-foreground">{dictionary.loads.rate}</dt><dd className="mt-1 font-semibold tnum">{formatMoney(load.grossRate)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">{dictionary.viewMode.tripProfit}</dt><dd className={cn("mt-1 font-semibold tnum", load.metrics.tripProfit >= 0 ? "text-pos" : "text-neg")}>{formatMoney(load.metrics.tripProfit)}</dd></div>
              </dl>
            </Link>
          </li>
        ))}
      </ul>
      {totals ? <div className="border-t border-border bg-surface-sunken/60 p-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">{dictionary.loads.totals}</p>
        <dl className="grid grid-cols-2 gap-3">
          <div><dt className="text-xs text-muted-foreground">{dictionary.loads.rate}</dt><dd className="font-semibold tnum">{formatMoney(totals.rate)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">{dictionary.viewMode.tripProfit}</dt><dd className={cn("font-semibold tnum", totals.profit >= 0 ? "text-pos" : "text-neg")}>{formatMoney(totals.profit)}</dd></div>
        </dl>
      </div> : null}
    </div>
  );
}
