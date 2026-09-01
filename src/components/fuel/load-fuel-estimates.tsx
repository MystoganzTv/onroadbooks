"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateShort, formatMiles, formatMoney } from "@/lib/formatters";
import type { Expense, LoadWithMetrics, Truck } from "@/lib/types";
import { FuelFormDialog } from "./fuel-form-dialog";

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
  if (estimates.length === 0) return null;

  const loadById = new Map(loads.map((load) => [load.id, load]));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Fuel costs from loads</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              These estimates count in Expenses, but do not supply gallons, MPG, or IFTA data. Add
              the actual fill-up to replace an estimate without double counting it.
            </p>
          </div>
          <Badge variant="warning">Estimated</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Load</TableHead>
                <TableHead>Route</TableHead>
                <TableHead className="text-right">Miles</TableHead>
                <TableHead className="text-right">Fuel cost</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {estimates.map((expense) => {
                const load = expense.loadId ? loadById.get(expense.loadId) : undefined;
                if (!load) return null;
                return (
                  <TableRow key={expense.id}>
                    <TableCell className="text-muted-foreground">
                      {formatDateShort(expense.date)}
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link
                        href={`/loads/${load.id}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        {load.loadNumber ? `#${load.loadNumber}` : "Load detail"}
                        <ExternalLink className="size-3" />
                      </Link>
                    </TableCell>
                    <TableCell>
                      {load.originState}-{load.destinationState}
                    </TableCell>
                    <TableCell className="text-right tnum">
                      {formatMiles(load.metrics.totalMiles)}
                    </TableCell>
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
                          <Button size="sm" variant="outline">
                            Add actual fill-up
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
