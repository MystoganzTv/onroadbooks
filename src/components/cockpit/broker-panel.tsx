"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/components/shell/language-provider";
import { formatMoneyCompact, formatPercent, formatRateValue } from "@/lib/formatters";
import type { BrokerScore } from "@/lib/finance/brokers";
import { cn } from "@/lib/utils";
import { interpolate } from "@/lib/i18n/dictionaries";

/**
 * Broker scorecard, ranked by profit per mile driven -- the number that
 * decides whether their next load is worth taking. Total profit is shown
 * alongside so a high-volume broker is not mistaken for a bad one.
 *
 * The rating badge lives on the full scorecard, not here: this panel is a
 * ranking, and five GREAT chips in a column is a wall of green that says less
 * than the rates already do.
 */
export function BrokerPanel({
  brokers,
  href,
  limit = 5,
  className,
}: {
  brokers: BrokerScore[];
  href?: string;
  limit?: number;
  className?: string;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.analytics;
  const ranked = [...brokers]
    .sort((a, b) => b.profitPerMile - a.profitPerMile)
    .slice(0, limit);

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Building2 className="size-3.5 text-muted-foreground" />
          <CardTitle>{copy.brokers}</CardTitle>
        </div>
        {href ? (
          <Link
            href={href}
            className="text-2xs font-medium text-primary underline-offset-2 hover:underline focus-ring"
          >
            {copy.fullScorecard}
          </Link>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        {ranked.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">
            {copy.noBrokerRecorded}
          </p>
        ) : (
          <ul className="divide-y divide-border/70">
            {ranked.map((broker) => (
              <li key={broker.broker} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-xs font-medium text-foreground">
                    {broker.broker}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 tnum text-sm font-semibold",
                      broker.profitPerMile >= 0 ? "text-pos" : "text-neg",
                    )}
                  >
                    {formatRateValue(broker.profitPerMile)}/mi
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-2xs text-muted-foreground tnum">
                    {interpolate(copy.brokerRow, {
                      count: broker.loadCount,
                      unit: broker.loadCount === 1 ? dictionary.settlements.load : copy.loads.toLowerCase(),
                      revenue: formatMoneyCompact(broker.revenue),
                      profit: formatMoneyCompact(broker.tripProfit),
                      deadhead: formatPercent(broker.deadheadPct, 0),
                    })}
                  </span>
                  {broker.qualified ? null : (
                    <span className="shrink-0 text-2xs text-muted-foreground">
                      {copy.oneLoadSoFar}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
