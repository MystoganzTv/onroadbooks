"use client";

import * as React from "react";
import { Paperclip, Pencil, Trash2, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
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
import { deleteMaintenanceAction } from "@/lib/actions/maintenance";
import {
  formatDateMedium,
  formatDateShort,
  formatMoney,
  formatOdometer,
} from "@/lib/formatters";
import { computeDue, maintenanceLabel, type DueThresholds } from "@/lib/maintenance";
import type { Document, MaintenanceRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DUE_STYLE } from "./upcoming-maintenance";
import { MaintenanceFormDialog } from "./maintenance-form-dialog";

interface MaintenanceTableProps {
  records: MaintenanceRecord[];
  documents: Document[];
  currentOdometer: number;
  truckId?: string;
  today: string;
  thresholds: DueThresholds;
}

export function MaintenanceTable({
  records,
  documents,
  truckId,
  currentOdometer,
  today,
  thresholds,
}: MaintenanceTableProps) {
  const router = useRouter();
  const [deleting, setDeleting] = React.useState<string | null>(null);

  async function remove(record: MaintenanceRecord) {
    setDeleting(record.id);
    const result = await deleteMaintenanceAction(record.id);
    setDeleting(null);
    if (result.ok) {
      toast.success("Service record deleted", { description: maintenanceLabel(record.type) });
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  const total = records.reduce((sum, record) => sum + record.cost, 0);

  if (records.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <EmptyState
          icon={Wrench}
          title="No service history yet"
          description="Log oil changes, tires, inspections and renewals to build a maintenance record for this truck."
          action={<MaintenanceFormDialog currentOdometer={currentOdometer} truckId={truckId} />}
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
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Odometer</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead>Next service</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[4.375rem] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {records.map((record) => {
              const due = computeDue(record, currentOdometer, today, thresholds);
              const style = DUE_STYLE[due.status];
              const attached = documents.filter((d) => d.maintenanceId === record.id);

              return (
                <TableRow key={record.id}>
                  <TableCell className="text-muted-foreground">
                    {formatDateShort(record.serviceDate)}
                    <span className="ml-1 text-2xs opacity-70">
                      {record.serviceDate.slice(0, 4)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      {maintenanceLabel(record.type)}
                      {attached.length > 0 ? (
                        <Paperclip
                          className="size-3 text-muted-foreground"
                          aria-label={`${attached.length} attached`}
                        />
                      ) : null}
                      {record.expenseId ? (
                        <Badge variant="outline" title="Also in the expense ledger">
                          Ledger
                        </Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tnum text-muted-foreground">
                    {record.odometer ? formatOdometer(record.odometer) : "--"}
                  </TableCell>
                  <TableCell className="max-w-[13rem] truncate text-muted-foreground">
                    {record.vendor ?? "--"}
                  </TableCell>
                  <TableCell className="text-right tnum">
                    {record.cost > 0 ? formatMoney(record.cost) : "--"}
                  </TableCell>
                  <TableCell className="text-muted-foreground tnum">
                    {record.nextServiceDate ? formatDateMedium(record.nextServiceDate) : null}
                    {record.nextServiceDate && record.nextServiceOdometer ? " / " : null}
                    {record.nextServiceOdometer ? formatOdometer(record.nextServiceOdometer) : null}
                    {!record.nextServiceDate && !record.nextServiceOdometer ? "--" : null}
                  </TableCell>
                  <TableCell>
                    <span className={cn("inline-flex items-center gap-1.5 text-2xs", style.text)}>
                      <span className={cn("size-1.5 rounded-full", style.dot)} aria-hidden />
                      {due.summary}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-0.5">
                      <MaintenanceFormDialog
                        record={record}
                        documents={attached}
                        currentOdometer={currentOdometer}
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label="Edit service record">
                            <Pencil />
                          </Button>
                        }
                      />
                      <ConfirmDelete
                        entity="service record"
                        label={`${maintenanceLabel(record.type)} - ${formatDateMedium(record.serviceDate)}`}
                        consequences={[
                          ...(record.expenseId ? ["Its linked row in the expense ledger"] : []),
                          ...(attached.length > 0
                            ? [`${attached.length} attached ${attached.length === 1 ? "document" : "documents"}`]
                            : []),
                        ]}
                        onConfirm={() => remove(record)}
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Delete service record"
                            disabled={deleting === record.id}
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
                colSpan={4}
                className="text-2xs uppercase tracking-wider text-muted-foreground"
              >
                Lifetime service spend
              </TableCell>
              <TableCell className="text-right tnum font-semibold">{formatMoney(total)}</TableCell>
              <TableCell colSpan={3} />
            </TableRow>
          </TableFooter>
        </Table>
      </TableWrapper>
    </div>
  );
}
