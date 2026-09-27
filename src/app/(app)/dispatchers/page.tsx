import Link from "next/link";
import { DispatcherFormDialog } from "@/components/dispatchers/dispatcher-form-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSession } from "@/lib/auth";
import { getDataset } from "@/lib/db";
import { brokerNameKey } from "@/lib/brokers";
import { dispatcherDirectory } from "@/lib/dispatchers";
import { tripExpenseLines } from "@/lib/calculations";
import { getAppLocale } from "@/lib/i18n-server";
import { getWebDictionary } from "@/lib/i18n/dictionaries";
import { formatMoney } from "@/lib/formatters";
import { param, type SearchParams } from "@/lib/period-params";
import { roleCan } from "@/lib/roles";

export const metadata = { title: "Dispatchers" };

export default async function DispatchersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [session, locale, params] = await Promise.all([requireSession(), getAppLocale(), searchParams]);
  const dataset = await getDataset(session.businessId);
  const copy = getWebDictionary(locale).dispatchers;
  const rows = dispatcherDirectory(dataset);
  const selected = rows.find(row => brokerNameKey(row.name) === brokerNameKey(param(params, "name") ?? ""));
  const canManage = roleCan(session.role ?? "VIEWER", "manage_loads");
  return <div className="space-y-4 p-4 lg:p-6">
    <PageHeader title={copy.title} description={copy.description} actions={canManage ? <DispatcherFormDialog /> : undefined} />
    <Card><CardContent className="overflow-x-auto p-0">
      {rows.length === 0 ? <p className="p-6 text-sm text-muted-foreground">{copy.empty}</p> : <Table>
        <TableHeader><TableRow><TableHead>{copy.name}</TableHead><TableHead>{copy.contact}</TableHead><TableHead className="text-right">{copy.loads}</TableHead><TableHead className="text-right">{copy.fees}</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>{rows.map(row => <TableRow key={brokerNameKey(row.name)}>
          <TableCell><Link className="font-medium text-primary hover:underline" href={`/dispatchers?name=${encodeURIComponent(row.name)}`}>{row.name}</Link></TableCell>
          <TableCell><p>{row.profile?.phone}</p><p>{row.profile?.email}</p></TableCell>
          <TableCell className="text-right">{row.loads.length}</TableCell><TableCell className="text-right tabular-nums">{formatMoney(row.fees)}</TableCell>
          <TableCell>{canManage ? <DispatcherFormDialog dispatcher={row.profile} initialName={row.name} /> : null}</TableCell>
        </TableRow>)}</TableBody>
      </Table>}
    </CardContent></Card>
    <p className="text-xs text-muted-foreground">{copy.feesHint}</p>
    {selected ? <Card>
      <CardHeader><CardTitle>{selected.name}</CardTitle><p className="text-sm text-muted-foreground">{selected.profile?.notes}</p></CardHeader>
      <CardContent className="overflow-x-auto p-0"><Table>
        <TableHeader><TableRow><TableHead>{copy.date}</TableHead><TableHead>{copy.load}</TableHead><TableHead>{copy.broker}</TableHead><TableHead className="text-right">{copy.fee}</TableHead></TableRow></TableHeader>
        <TableBody>{[...selected.loads].sort((a, b) => b.date.localeCompare(a.date)).map(load => <TableRow key={load.id}>
          <TableCell className="whitespace-nowrap">{load.date}</TableCell><TableCell><Link className="text-primary hover:underline" href={`/loads/${load.id}`}>{load.loadNumber || `${load.originCity} → ${load.destinationCity}`}</Link></TableCell><TableCell>{load.broker ?? "—"}</TableCell>
          <TableCell className="text-right tabular-nums">{formatMoney(tripExpenseLines(load, dataset.expenses).find(line => line.key === "dispatch")?.amount ?? 0)}</TableCell>
        </TableRow>)}</TableBody>
      </Table><p className="border-t border-border p-4 text-right font-semibold">{copy.total}: {formatMoney(selected.fees)}</p></CardContent>
    </Card> : null}
  </div>;
}
