import type { Metadata } from "next";
import Link from "next/link";
import { Download, ExternalLink } from "lucide-react";

import { InvoiceActions } from "@/components/invoices/invoice-actions";
import { InvoiceDialog } from "@/components/invoices/invoice-dialog";
import { PaymentDialog } from "@/components/invoices/payment-dialog";
import { MiniStat } from "@/components/dashboard/mini-stat";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { formatDateMedium, formatMoney } from "@/lib/formatters";
import {
  invoiceAgeDays,
  invoicePaymentSummary,
  nextInvoiceNumber,
} from "@/lib/invoices";
import { todayISO } from "@/lib/periods";
import { roleCan } from "@/lib/roles";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  const session = await requireSession();
  const dataset = await getRepository(session.businessId).getDataset();
  const today = todayISO();
  const canManage = roleCan(session.role ?? "VIEWER", "manage_finances");
  const loads = [...dataset.loads].sort((a, b) =>
    (b.invoiceDate ?? b.date).localeCompare(a.invoiceDate ?? a.date),
  );
  const invoiced = loads.filter((load) => load.invoiceNumber);
  const payments = new Map(
    loads.map((load) => [load.id, invoicePaymentSummary(load, dataset.paymentEvents)]),
  );
  const outstanding = invoiced.filter((load) => payments.get(load.id)!.balance > 0);
  const overdue = outstanding.filter((load) => (invoiceAgeDays(load) ?? 0) > 0);
  const suggestedNumber = nextInvoiceNumber(loads, today);

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader title="Invoices" description="Issue freight invoices, track receivables, and download a ready-to-send PDF." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat label="Accounts Receivable" value={formatMoney(outstanding.reduce((sum, load) => sum + payments.get(load.id)!.balance, 0))} sub={`${outstanding.length} invoices`} />
        <MiniStat label="Overdue" value={formatMoney(overdue.reduce((sum, load) => sum + payments.get(load.id)!.balance, 0))} sub={`${overdue.length} invoices`} tone={overdue.length ? "warning" : undefined} />
        <MiniStat label="Cash Collected" value={formatMoney(invoiced.reduce((sum, load) => sum + payments.get(load.id)!.collected, 0))} sub="recorded receipts" />
        <MiniStat label="Uninvoiced loads" value={String(loads.filter((load) => !load.invoiceNumber).length)} sub="Ready to bill" />
      </div>
      <Card>
        <CardHeader><CardTitle>Freight invoices</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loads.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Add a load before issuing an invoice.</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Invoice / load</TableHead><TableHead>Customer</TableHead><TableHead>Lane</TableHead>
                  <TableHead>Issued</TableHead><TableHead>Due</TableHead><TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>{loads.map((load) => {
                  const age = invoiceAgeDays(load);
                  const payment = payments.get(load.id)!;
                  return <TableRow key={load.id}>
                    <TableCell>
                      <Link href={`/loads/${load.id}`} className="font-medium hover:underline">{load.invoiceNumber ?? load.loadNumber ?? "Unnumbered load"}</Link>
                      {load.invoiceNumber && load.loadNumber ? <span className="block text-2xs text-muted-foreground">Load {load.loadNumber}</span> : null}
                    </TableCell>
                    <TableCell>{load.billToName ?? load.broker ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{load.originCity}, {load.originState} → {load.destinationCity}, {load.destinationState}</TableCell>
                    <TableCell>{load.invoiceDate ? formatDateMedium(load.invoiceDate) : "—"}</TableCell>
                    <TableCell className={age != null && age > 0 ? "text-neg" : undefined}>
                      {load.invoiceDueDate ? formatDateMedium(load.invoiceDueDate) : "—"}
                      {age != null && age > 0 ? <span className="block text-2xs">{age}d overdue</span> : null}
                    </TableCell>
                    <TableCell><StatusBadge status={load.status} /></TableCell>
                    <TableCell className="text-right font-medium tnum">
                      {formatMoney(load.grossRate)}
                      {payment.collected > 0 && payment.balance > 0 ? <span className="block text-2xs font-normal text-muted-foreground">{formatMoney(payment.balance)} due</span> : null}
                    </TableCell>
                    <TableCell><div className="flex items-center justify-end gap-1">
                      <InvoiceDialog load={load} suggestedNumber={suggestedNumber} today={today} canManage={canManage} />
                      {load.invoiceNumber ? <Button asChild size="icon-sm" variant="outline" title="Download PDF"><a href={`/api/export/invoice/${load.id}`}><Download /></a></Button> : null}
                      <Button asChild size="icon-sm" variant="ghost" title="Open load"><Link href={`/loads/${load.id}`}><ExternalLink /></Link></Button>
                      {load.invoiceNumber ? <PaymentDialog loadId={load.id} balance={payment.balance} today={today} canManage={canManage} /> : null}
                      <InvoiceActions loadId={load.id} status={load.status} today={today} canManage={canManage} />
                    </div></TableCell>
                  </TableRow>;
                })}</TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
