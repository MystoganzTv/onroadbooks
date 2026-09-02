"use client";

import * as React from "react";
import { Paperclip, Pencil, Trash2, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { localizedClientError } from "@/lib/i18n/errors";
import { useLanguage } from "@/components/shell/language-provider";
import { interpolate } from "@/lib/i18n/dictionaries";
import { formatLocaleDate } from "@/lib/i18n-format";

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
  const { dictionary, locale } = useLanguage();
  const copy = dictionary.maintenance;
  const router = useRouter();
  const [deleting, setDeleting] = React.useState<string | null>(null);

  async function remove(record: MaintenanceRecord) {
    setDeleting(record.id);
    const result = await deleteMaintenanceAction(record.id);
    setDeleting(null);
    if (result.ok) {
      toast.success(copy.serviceDeleted, { description: maintenanceLabel(record.type, locale) });
      router.refresh();
    } else {
      toast.error(localizedClientError(result.error));
    }
  }

  const total = records.reduce((sum, record) => sum + record.cost, 0);

  if (records.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <EmptyState
          icon={Wrench}
          title={copy.noHistory}
          description={copy.noHistoryDescription}
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
              <TableHead>{copy.date}</TableHead>
              <TableHead>{copy.type}</TableHead>
              <TableHead className="text-right">{copy.odometer}</TableHead>
              <TableHead>{copy.vendor}</TableHead>
              <TableHead className="text-right">{copy.cost}</TableHead>
              <TableHead>{copy.nextService}</TableHead>
              <TableHead>{copy.status}</TableHead>
              <TableHead className="w-[4.375rem] text-right">{copy.actions}</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {records.map((record) => {
              const due = computeDue(record, currentOdometer, today, thresholds, locale);
              const style = DUE_STYLE[due.status];
              const attached = documents.filter((d) => d.maintenanceId === record.id);

              return (
                <TableRow key={record.id}>
                  <TableCell className="text-muted-foreground">
                    {formatLocaleDate(record.serviceDate, locale, "short")}
                    <span className="ml-1 text-2xs opacity-70">
                      {record.serviceDate.slice(0, 4)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      {maintenanceLabel(record.type, locale)}
                      {attached.length > 0 ? (
                        <Paperclip
                          className="size-3 text-muted-foreground"
                          aria-label={interpolate(copy.attached, { count: attached.length })}
                        />
                      ) : null}
                      {record.expenseId ? (
                        <Badge variant="outline" title={copy.ledgerTitle}>
                          {copy.ledger}
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
                    {record.nextServiceDate ? formatLocaleDate(record.nextServiceDate, locale, "medium") : null}
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
                          <Button variant="ghost" size="icon-sm" aria-label={copy.editRecord}>
                            <Pencil />
                          </Button>
                        }
                      />
                      <ConfirmDelete
                        entity={copy.serviceRecord}
                        label={`${maintenanceLabel(record.type, locale)} - ${formatLocaleDate(record.serviceDate, locale, "medium")}`}
                        consequences={[
                          ...(record.expenseId ? [copy.linkedLedger] : []),
                          ...(attached.length > 0
                            ? [interpolate(copy.attachedDocuments, { count: attached.length, unit: attached.length === 1 ? copy.document : copy.documents })]
                            : []),
                        ]}
                        onConfirm={() => remove(record)}
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={copy.deleteRecord}
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
                {copy.lifetimeSpend}
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
