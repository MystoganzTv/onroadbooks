import { Building2, TrendingDown } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { RatingBadge } from "@/components/loads/rating-badge";
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
import type { BrokerPerformance } from "@/lib/calculations";
import { isDeadheadElevated } from "@/lib/calculations";
import {
  formatMoney,
  formatNumber,
  formatPercent,
  formatRateValue,
} from "@/lib/formatters";
import { cn } from "@/lib/utils";

/**
 * Which brokers actually make money -- ranked on Contribution Profit, with profit
 * per total mile alongside so a high-volume broker paying thin rates cannot
 * hide behind its revenue.
 *
 * Miles and rate per loaded mile are dropped in print: ten columns do not fit
 * a portrait page, and those two are the ones the reader can live without.
 */
export function BrokerTable({
  brokers,
  deadheadWarnPct = 20,
}: {
  brokers: BrokerPerformance[];
  deadheadWarnPct?: number;
}) {
  const best = brokers[0];
  const worst = brokers.length > 1 ? brokers[brokers.length - 1] : undefined;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Building2 className="size-3.5 text-muted-foreground" />
          <CardTitle>Broker Performance</CardTitle>
        </div>
        <span className="text-2xs text-muted-foreground">Ranked by Contribution Profit</span>
      </CardHeader>

      {brokers.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No broker activity in this period"
          description="Add loads with a broker name to see which relationships actually pay."
          compact
        />
      ) : (
        <>
          <TableWrapper>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Broker</TableHead>
                  <TableHead className="text-right">Loads</TableHead>
                  <TableHead className="text-right">Booked Revenue</TableHead>
                  <TableHead className="text-right print:hidden">Miles</TableHead>
                  <TableHead className="text-right">DH %</TableHead>
                  <TableHead className="text-right print:hidden">$/Loaded</TableHead>
                  <TableHead className="text-right">Contribution Profit</TableHead>
                  <TableHead className="text-right">Contribution/mi</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {brokers.map((broker) => (
                  <TableRow key={broker.broker}>
                    <TableCell className="max-w-[15rem] truncate font-medium">
                      {broker.broker}
                    </TableCell>
                    <TableCell className="text-right tnum text-muted-foreground">
                      {broker.loadCount}
                    </TableCell>
                    <TableCell className="text-right tnum">
                      {formatMoney(broker.revenue)}
                    </TableCell>
                    <TableCell className="text-right tnum text-muted-foreground print:hidden">
                      {formatNumber(broker.totalMiles)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tnum",
                        isDeadheadElevated(broker.deadheadPct, deadheadWarnPct)
                          ? "text-warn"
                          : "text-muted-foreground",
                      )}
                    >
                      {formatPercent(broker.deadheadPct)}
                    </TableCell>
                    <TableCell className="text-right tnum text-muted-foreground print:hidden">
                      {formatRateValue(broker.revenuePerLoadedMile)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tnum font-medium",
                        broker.tripProfit >= 0 ? "text-pos" : "text-neg",
                      )}
                    >
                      {formatMoney(broker.tripProfit)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tnum",
                        broker.profitPerMile >= 0 ? "text-pos" : "text-neg",
                      )}
                    >
                      {formatRateValue(broker.profitPerMile)}
                    </TableCell>
                    <TableCell>
                      <RatingBadge rating={broker.rating} />
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tnum",
                        broker.outstanding > 0 ? "text-warn" : "text-muted-foreground",
                      )}
                    >
                      {broker.outstanding > 0 ? formatMoney(broker.outstanding) : "--"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrapper>

          {best && worst && best.broker !== worst.broker ? (
            <div className="grid gap-3 border-t border-border p-4 sm:grid-cols-2">
              <div className="rounded-md border border-pos/30 bg-pos-soft p-3">
                <p className="label-xs text-pos/80">Best relationship</p>
                <p className="mt-1 truncate text-sm font-semibold text-pos">{best.broker}</p>
                <p className="mt-0.5 text-2xs text-pos/90 tnum">
                  {formatMoney(best.tripProfit)} Contribution Profit across {best.loadCount}{" "}
                  {best.loadCount === 1 ? "load" : "loads"} at{" "}
                  {formatRateValue(best.profitPerMile)}/mi
                </p>
              </div>
              <div className="rounded-md border border-border bg-surface-sunken p-3">
                <p className="label-xs flex items-center gap-1.5">
                  <TrendingDown className="size-3" />
                  Weakest relationship
                </p>
                <p className="mt-1 truncate text-sm font-semibold">{worst.broker}</p>
                <p className="mt-0.5 text-2xs text-muted-foreground tnum">
                  {formatMoney(worst.tripProfit)} Contribution Profit at{" "}
                  {formatRateValue(worst.profitPerMile)}/mi with{" "}
                  {formatPercent(worst.deadheadPct)} deadhead
                </p>
              </div>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
