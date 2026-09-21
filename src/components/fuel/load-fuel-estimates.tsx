"use client";

import Link from "next/link";
import { ExternalLink, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMiles, formatMoney } from "@/lib/formatters";
import type { Expense, LoadWithMetrics, Truck } from "@/lib/types";
import { FuelFormDialog } from "./fuel-form-dialog";
import { useViewMode } from "@/components/shell/view-mode-provider";
import { useLanguage } from "@/components/shell/language-provider";
import { formatLocaleDate } from "@/lib/i18n-format";

interface LoadFuelEstimatesProps {
  estimates: Expense[];
  loads: LoadWithMetrics[];
  trucks: Truck[];
  lastOdometer: number | null;
}

export function LoadFuelEstimates({
  estimates,
  loads,
  trucks,
  lastOdometer,
}: LoadFuelEstimatesProps) {
  const { locale, dictionary } = useLanguage();
  const copy = dictionary.fuel;
  const { mode } = useViewMode();
  const simple = mode === "simple";
  if (estimates.length === 0) return null;

  const loadById = new Map(loads.map((load) => [load.id, load]));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>{copy.estimatesTitle}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {copy.estimatesDescription}
            </p>
          </div>
          <Badge variant="outline">{copy.estimated}</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{copy.date}</TableHead>
                <TableHead>{copy.load}</TableHead>
                {!simple ? <><TableHead>{copy.route}</TableHead>
                <TableHead className="text-right">{copy.miles}</TableHead></> : null}
                <TableHead className="text-right">{simple ? copy.total : copy.fuelCost}</TableHead>
                <TableHead className="text-right">{copy.action}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {estimates.map((expense) => {
                const load = expense.loadId ? loadById.get(expense.loadId) : undefined;
                if (!load) return null;
                return (
                  <TableRow key={expense.id}>
                    <TableCell className="text-muted-foreground">
                      {formatLocaleDate(expense.date, locale, { month: "short", day: "numeric" })}
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link
                        href={`/loads/${load.id}`}
                        className="inline-flex max-w-28 items-center gap-1 whitespace-normal break-all text-primary hover:underline"
                      >
                        {load.loadNumber ? `#${load.loadNumber}` : copy.loadDetail}
                        <ExternalLink className="size-3" />
                      </Link>
                    </TableCell>
                    {!simple ? <><TableCell>
                      {load.originState}-{load.destinationState}
                    </TableCell>
                    <TableCell className="text-right tnum">
                      {formatMiles(load.metrics.totalMiles)}
                    </TableCell></> : null}
                    <TableCell className="text-right tnum font-medium text-neg">
                      -{formatMoney(expense.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <FuelFormDialog
                        loads={loads}
                        trucks={trucks}
                        defaultTruckId={load.truckId}
                        defaultLoadId={load.id}
                        defaultDate={expense.date}
                        lastOdometer={lastOdometer}
                        trigger={
                          <Button size={simple ? "icon-sm" : "sm"} variant="outline" aria-label={copy.addActual}>
                            {simple ? <Plus /> : copy.addActual}
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
