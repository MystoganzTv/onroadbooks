import Link from "next/link";
import { formatLoadReference } from "@/lib/load-reference";
import { loadRoute } from "@/lib/load-details";
import { DispatcherFormDialog } from "@/components/dispatchers/dispatcher-form-dialog";
import { DispatchFeeRow } from "@/components/dispatchers/dispatch-fee-row";
import { DispatcherRow } from "@/components/dispatchers/dispatcher-row";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSession } from "@/lib/auth";
import { getDataset } from "@/lib/db";
import { brokerNameKey } from "@/lib/brokers";
import { dispatcherDirectory } from "@/lib/dispatchers";
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
        <TableHeader><TableRow><TableHead>{copy.name}</TableHead><TableHead>{copy.contact}</TableHead><TableHead className="text-right">{copy.loads}</TableHead><TableHead className="text-right">{copy.fees}</TableHead><TableHead className="text-right">{copy.owedColumn}</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>{rows.map(row => <DispatcherRow key={brokerNameKey(row.name)} href={`/dispatchers?name=${encodeURIComponent(row.name)}`} selected={row === selected}>
          <TableCell><Link className="font-medium text-primary hover:underline" href={`/dispatchers?name=${encodeURIComponent(row.name)}`} scroll={false}>{row.name}</Link></TableCell>
          <TableCell><p>{row.profile?.phone}</p><p>{row.profile?.email}</p></TableCell>
          <TableCell className="text-right">{row.loads.length}</TableCell><TableCell className="text-right tabular-nums">{formatMoney(row.fees)}</TableCell>
          <TableCell className={row.owed > 0 ? "text-right font-semibold tabular-nums" : "text-right tabular-nums text-muted-foreground"}>{formatMoney(row.owed)}</TableCell>
          <TableCell>{canManage ? <DispatcherFormDialog dispatcher={row.profile} initialName={row.name} /> : null}</TableCell>
        </DispatcherRow>)}</TableBody>
      </Table>}
    </CardContent></Card>
    {selected ? <Card>
      <CardHeader><CardTitle>{selected.name}</CardTitle><p className="text-sm text-muted-foreground">{selected.profile?.notes}</p></CardHeader>
      <CardContent className="overflow-x-auto p-0"><Table>
        <TableHeader><TableRow><TableHead>{copy.paidColumn}</TableHead><TableHead>{copy.date}</TableHead><TableHead>{copy.load}</TableHead><TableHead>{copy.broker}</TableHead><TableHead className="text-right">{copy.fee}</TableHead></TableRow></TableHeader>
        <TableBody>{[...selected.loads].sort((a, b) => b.date.localeCompare(a.date)).map(load => <DispatchFeeRow
          key={load.id}
          loadId={load.id}
          pickup={load.date}
          loadLabel={formatLoadReference(load.loadNumber) ?? loadRoute(load)}
          route={formatLoadReference(load.loadNumber) ? loadRoute(load) : null}
          broker={load.broker ?? "—"}
          fee={formatMoney(selected.loadFees[load.id] ?? 0)}
          paidDate={load.dispatchPaidDate ?? null}
          canManage={canManage}
        />)}</TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 border-t border-border p-4 text-sm">
        <span className="text-muted-foreground">{copy.paidTotal}: <span className="tabular-nums text-primary">{formatMoney(selected.paid)}</span></span>
        <span className="text-muted-foreground">{copy.owedTotal}: <span className="font-semibold tabular-nums text-foreground">{formatMoney(selected.owed)}</span></span>
        <span className="font-semibold">{copy.total}: <span className="tabular-nums">{formatMoney(selected.fees)}</span></span>
      </div></CardContent>
    </Card> : null}
  </div>;
}
