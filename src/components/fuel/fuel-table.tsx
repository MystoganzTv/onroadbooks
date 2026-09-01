"use client";

import * as React from "react";
import { Fuel, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from "@/components/ui/table";
import { deleteFuelEntryAction } from "@/lib/actions/fuel";
import { div } from "@/lib/calculations";
import {
  formatDateShort,
  formatMoney,
  formatNumber,
  formatOdometer,
} from "@/lib/formatters";
import type { FuelEntry, LoadWithMetrics, Truck } from "@/lib/types";
import { FuelFormDialog } from "./fuel-form-dialog";

interface FuelTableProps {
  entries: FuelEntry[];
  loads: LoadWithMetrics[];
  trucks?: Truck[];
  defaultTruckId?: string | null;
  defaultDate: string;
  lastOdometer: number | null;
  hasLoadEstimates?: boolean;
}

export function FuelTable({
  entries,
  loads,
  trucks = [],
  defaultTruckId,
  defaultDate,
  lastOdometer,
  hasLoadEstimates = false,
}: FuelTableProps) {
  const router = useRouter();
  const [deleting, setDeleting] = React.useState<string | null>(null);

  // Segment MPG: miles since the previous reading / gallons in this fill-up.
  const ordered = React.useMemo(
    () => [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
    [entries],
  );

  const segmentMpg = React.useMemo(() => {
    const map = new Map<string, number | null>();
    let previousOdometer: number | null = null;
    for (const entry of ordered) {
      if (previousOdometer !== null && entry.odometer && entry.odometer > previousOdometer) {
        map.set(entry.id, div(entry.odometer - previousOdometer, entry.gallons));
      } else {
        map.set(entry.id, null);
      }
      if (entry.odometer) previousOdometer = entry.odometer;
    }
    return map;
  }, [ordered]);

  const rows = [...ordered].reverse();
  const totals = rows.reduce(
    (acc, entry) => ({
      gallons: acc.gallons + entry.gallons,
      cost: acc.cost + entry.totalCost,
    }),
    { gallons: 0, cost: 0 },
  );

  async function remove(entry: FuelEntry) {
    setDeleting(entry.id);
    const result = await deleteFuelEntryAction(entry.id);
    setDeleting(null);
    if (result.ok) {
      toast.success("Fuel entry deleted");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <EmptyState
          icon={Fuel}
          title="No detailed fill-ups in this period"
          description={
            hasLoadEstimates
              ? "The load estimates above already count toward fuel spend. Add the actual gallons and odometer readings to calculate MPG and complete IFTA."
              : "Log each fill-up with its odometer reading and the app will calculate MPG and fuel cost per mile."
          }
          action={
            <FuelFormDialog
              loads={loads}
              trucks={trucks}
              defaultTruckId={defaultTruckId}
              defaultDate={defaultDate}
              lastOdometer={lastOdometer}
            />
          }
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <TableWrapper>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Date</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-right">Gallons</TableHead>
              <TableHead className="text-right">$ / gal</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Odometer</TableHead>
              <TableHead className="text-right">Segment MPG</TableHead>
              <TableHead className="w-[4.375rem] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.map((entry) => {
              const mpg = segmentMpg.get(entry.id);
              return (
                <TableRow key={entry.id}>
                  <TableCell className="text-muted-foreground">
                    {formatDateShort(entry.date)}
                  </TableCell>
                  <TableCell className="max-w-[12.5rem] truncate">
                    {entry.location ?? "--"}
                  </TableCell>
                  <TableCell className="text-right tnum">
                    {formatNumber(entry.gallons, 1)}
                  </TableCell>
                  <TableCell className="text-right tnum text-muted-foreground">
                    ${entry.pricePerGallon.toFixed(3)}
                  </TableCell>
                  <TableCell className="text-right tnum font-medium text-neg">
                    -{formatMoney(entry.totalCost)}
                  </TableCell>
                  <TableCell className="text-right tnum text-muted-foreground">
                    {entry.odometer ? formatOdometer(entry.odometer) : "--"}
                  </TableCell>
                  <TableCell className="text-right tnum">
                    {mpg ? `${mpg.toFixed(1)}` : <span className="text-muted-foreground">--</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-0.5">
                      <FuelFormDialog
                        trucks={trucks}
                        entry={entry}
                        loads={loads}
                        lastOdometer={lastOdometer}
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label="Edit fuel entry">
                            <Pencil />
                          </Button>
                        }
                      />
                      <ConfirmDelete
                        entity="fuel entry"
                        label={`${formatDateShort(entry.date)} - ${formatNumber(entry.gallons, 1)} gal, ${formatMoney(entry.totalCost)}`}
                        consequences={["Its matching Fuel row in the expense ledger"]}
                        onConfirm={() => remove(entry)}
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Delete fuel entry"
                            disabled={deleting === entry.id}
                            className="text-muted-foreground hover:text-neg"
                          >
                            <Trash2 />
                          </Button>
                        }
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>

          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={2}
                className="text-2xs uppercase tracking-wider text-muted-foreground"
              >
                Total
              </TableCell>
              <TableCell className="text-right tnum font-semibold">
                {formatNumber(totals.gallons, 1)}
              </TableCell>
              <TableCell className="text-right tnum text-muted-foreground">
                ${div(totals.cost, totals.gallons).toFixed(3)}
              </TableCell>
              <TableCell className="text-right tnum font-semibold text-neg">
                -{formatMoney(totals.cost)}
              </TableCell>
              <TableCell colSpan={3} />
            </TableRow>
          </TableFooter>
        </Table>
      </TableWrapper>
    </div>
  );
}
