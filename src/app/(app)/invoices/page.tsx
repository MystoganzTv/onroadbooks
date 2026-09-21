import type { Metadata } from "next";
import Link from "next/link";
import { Download, ExternalLink } from "lucide-react";

import { InvoiceActions } from "@/components/invoices/invoice-actions";
import { InvoiceDialog } from "@/components/invoices/invoice-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSession } from "@/lib/auth";
import { getDataset } from "@/lib/db";
import { formatMoney } from "@/lib/formatters";
import {
  nextInvoiceNumber,
} from "@/lib/invoices";
import { todayISO } from "@/lib/periods";
import { roleCan } from "@/lib/roles";
import { getAppLocale } from "@/lib/i18n-server";
import { getWebDictionary, interpolate } from "@/lib/i18n/dictionaries";
import { formatLocaleDate } from "@/lib/i18n-format";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).invoices.metadataTitle };
}

export default async function InvoicesPage() {
  const [session, locale] = await Promise.all([requireSession(), getAppLocale()]);
  const dictionary = getWebDictionary(locale);
  const copy = dictionary.invoices;
  const dataset = await getDataset(session.businessId);
  const today = todayISO();
  const canManage = roleCan(session.role ?? "VIEWER", "manage_finances");
  const loads = [...dataset.loads].sort((a, b) =>
    (b.invoiceDate ?? b.date).localeCompare(a.invoiceDate ?? a.date),
  );
  const suggestedNumber = nextInvoiceNumber(loads, today);

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader title={copy.title} description={copy.description} />
      <Card>
        <CardHeader><CardTitle>{copy.freightInvoices}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loads.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">{copy.addLoadFirst}</p> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{copy.invoiceLoad}</TableHead><TableHead>{copy.customer}</TableHead><TableHead>{copy.lane}</TableHead>
                  <TableHead>{copy.issued}</TableHead>
                  <TableHead className="text-right">{copy.amount}</TableHead><TableHead className="text-right">{dictionary.common.actions}</TableHead>
                </TableRow></TableHeader>
                <TableBody>{loads.map((load) => {
                  return <TableRow key={load.id}>
                    <TableCell>
                      <Link href={`/loads/${load.id}`} className="font-medium hover:underline">{load.invoiceNumber ?? load.loadNumber ?? copy.unnumberedLoad}</Link>
                      {load.invoiceNumber && load.loadNumber ? <span className="block text-2xs text-muted-foreground">{interpolate(copy.loadNumber, { number: load.loadNumber })}</span> : null}
                    </TableCell>
                    <TableCell>{load.billToName ?? load.broker ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{load.originCity}, {load.originState} → {load.destinationCity}, {load.destinationState}</TableCell>
                    <TableCell>{load.invoiceDate ? formatLocaleDate(load.invoiceDate, locale) : "—"}</TableCell>
                    <TableCell className="text-right font-medium tnum">
                      {formatMoney(load.grossRate)}
                    </TableCell>
                    <TableCell><div className="flex items-center justify-end gap-1">
                      <InvoiceDialog load={load} suggestedNumber={suggestedNumber} today={today} canManage={canManage} />
                      {load.invoiceNumber ? <Button asChild size="icon-sm" variant="outline" title={copy.downloadPdf}><a href={`/api/export/invoice/${load.id}`}><Download /></a></Button> : null}
                      <Button asChild size="icon-sm" variant="ghost" title={copy.openLoad}><Link href={`/loads/${load.id}`}><ExternalLink /></Link></Button>
                      <InvoiceActions loadId={load.id} canVoid={Boolean(load.invoiceNumber) && load.status !== "PAID" && !dataset.paymentEvents.some((event) => event.loadId === load.id)} canManage={canManage} />
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
