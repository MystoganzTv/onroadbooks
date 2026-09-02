"use client";

import * as React from "react";
import { Fuel, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";
import { useLanguage } from "@/components/shell/language-provider";

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
  formatMoney,
  formatNumber,
  formatOdometer,
} from "@/lib/formatters";
import type { FuelEntry, LoadWithMetrics, Truck } from "@/lib/types";
import { formatLocaleDate } from "@/lib/i18n-format";
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
  const { locale, dictionary } = useLanguage();
  const copy = dictionary.fuel;
  const common = dictionary.common;
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
      toast.success(copy.fuelEntryDeleted);
      router.refresh();
    } else {
      toast.error(localizedClientError(result.error));
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <EmptyState
          icon={Fuel}
          title={copy.noFillUps}
          description={
            hasLoadEstimates
              ? copy.estimatesAlreadyCount
              : copy.logFillUps
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
              <TableHead>{copy.date}</TableHead>
              <TableHead>{copy.location}</TableHead>
              <TableHead className="text-right">{copy.gallons}</TableHead>
              <TableHead className="text-right">{copy.pricePerGallon}</TableHead>
              <TableHead className="text-right">{copy.total}</TableHead>
              <TableHead className="text-right">{copy.odometer}</TableHead>
              <TableHead className="text-right">{copy.segmentMpg}</TableHead>
              <TableHead className="w-[4.375rem] text-right">{common.actions}</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.map((entry) => {
              const mpg = segmentMpg.get(entry.id);
              return (
                <TableRow key={entry.id}>
                  <TableCell className="text-muted-foreground">
                    {formatLocaleDate(entry.date, locale, { month: "short", day: "numeric" })}
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
                          <Button variant="ghost" size="icon-sm" aria-label={copy.editEntry}>
                            <Pencil />
                          </Button>
                        }
                      />
                      <ConfirmDelete
                        entity="fuel entry"
                        label={`${formatLocaleDate(entry.date, locale, { month: "short", day: "numeric" })} · ${formatNumber(entry.gallons, 1)} gal · ${formatMoney(entry.totalCost)}`}
                        consequences={[copy.matchingLedgerRow]}
                        onConfirm={() => remove(entry)}
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={copy.deleteEntry}
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
                {copy.total}
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
