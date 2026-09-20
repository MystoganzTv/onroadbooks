"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Package } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { SimpleLoadCards } from "@/components/loads/simple-load-cards";
import { useLanguage } from "@/components/shell/language-provider";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from "@/components/ui/table";
import { formatMoney, formatNumber, formatRateValue } from "@/lib/formatters";
import { formatLocaleDate } from "@/lib/i18n-format";
import type { LoadWithMetrics } from "@/lib/types";
import { cn } from "@/lib/utils";

export function RecentLoads({ loads, simple = false }: { loads: LoadWithMetrics[]; simple?: boolean }) {
  const router = useRouter();
  const { locale, dictionary } = useLanguage();
  const copy = dictionary.dashboard;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.recentLoads}</CardTitle>
        <Button asChild variant="ghost" size="sm" className="-my-1 text-muted-foreground">
          <Link href="/loads">
            {copy.allLoads}
            <ArrowRight />
          </Link>
        </Button>
      </CardHeader>

      {loads.length === 0 ? (
        <EmptyState
          icon={Package}
          title={copy.noLoadsPeriod}
          description={copy.pickPeriod}
          compact
        />
      ) : (
        <>
          {simple ? <SimpleLoadCards loads={loads} /> : null}
          <TableWrapper className={simple ? "hidden sm:block" : undefined}>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{copy.date}</TableHead>
                  <TableHead>{copy.route}</TableHead>
                  {!simple ? <><TableHead className="hidden sm:table-cell">{copy.broker}</TableHead><TableHead className="text-right">{copy.miles}</TableHead></> : null}
                  <TableHead className="text-right">{copy.rate}</TableHead>
                  <TableHead className="text-right">{simple ? dictionary.viewMode.tripProfit : copy.contributionPerMile}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loads.map((load) => (
                  <TableRow
                    key={load.id}
                    className="group cursor-pointer"
                    onClick={() => router.push(`/loads/${load.id}`)}
                  >
                    <TableCell className="text-muted-foreground">
                      {formatLocaleDate(load.date, locale, "short")}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/loads/${load.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="rounded-sm outline-none group-hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {load.originCity}, {load.originState}
                        <span className="mx-1 text-muted-foreground">{dictionary.loads.to}</span>
                        {load.destinationCity}, {load.destinationState}
                      </Link>
                    </TableCell>
                    {!simple ? <><TableCell className="hidden max-w-[12rem] truncate text-muted-foreground sm:table-cell">
                      {load.broker ?? "--"}
                    </TableCell>
                    <TableCell className="text-right tnum text-muted-foreground">
                      {formatNumber(load.metrics.totalMiles)}
                    </TableCell></> : null}
                    <TableCell className="text-right tnum font-medium">
                      {formatMoney(load.grossRate)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tnum",
                        load.metrics.profitPerMile >= 0 ? "text-pos" : "text-neg",
                      )}
                    >
                      {simple ? formatMoney(load.metrics.tripProfit) : formatRateValue(load.metrics.profitPerMile)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrapper>
        </>
      )}
    </Card>
  );
}
