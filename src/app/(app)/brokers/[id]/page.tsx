import Link from "next/link";
import { notFound } from "next/navigation";
import { BrokerContactsCard } from "@/components/brokers/broker-contacts-card";
import { BrokerFormDialog } from "@/components/brokers/broker-form-dialog";
import { DeleteBrokerButton } from "@/components/brokers/delete-broker-button";
import { HistoryBackButton } from "@/components/shared/history-back-button";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/auth";
import { getDataset } from "@/lib/db";
import { brokerContactsOf, brokerNameKey } from "@/lib/brokers";
import { getAppLocale } from "@/lib/i18n-server";
import { getWebDictionary } from "@/lib/i18n/dictionaries";
import { formatMoney } from "@/lib/formatters";
import { formatLocaleDate } from "@/lib/i18n-format";
import { roleCan } from "@/lib/roles";

export const metadata = { title: "Broker" };

export default async function BrokerPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session, locale] = await Promise.all([params, requireSession(), getAppLocale()]);
  const dataset = await getDataset(session.businessId);
  const broker = dataset.brokers?.find((row) => row.id === id);
  if (!broker) notFound();
  const dictionary = getWebDictionary(locale);
  const copy = dictionary.brokers;
  const loads = dataset.loads.filter((load) => brokerNameKey(load.broker ?? "") === broker.nameKey).sort((a, b) => b.date.localeCompare(a.date));
  const contacts = brokerContactsOf(broker);
  const canManage = roleCan(session.role ?? "VIEWER", "manage_loads");
  return <div className="space-y-4 p-4 lg:p-6">
    <HistoryBackButton fallbackHref="/brokers" label={copy.back} />
    <PageHeader title={broker.name} actions={canManage ? <div className="flex flex-wrap gap-2">
      <BrokerFormDialog broker={broker} loadCount={loads.length} trigger={<Button variant="outline" size="sm">{copy.edit}</Button>} />
      <DeleteBrokerButton brokerId={broker.id} brokerName={broker.name} loadCount={loads.length} contactNames={contacts.map((contact) => contact.name)} />
    </div> : undefined} />
    <Card><CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
      {broker.phone ? <div><p className="label-xs">{copy.phone}</p><a className="mt-1 block text-primary hover:underline" href={`tel:${broker.phone}`}>{broker.phone}</a></div> : null}
      {broker.email && !broker.contactName ? <div><p className="label-xs">{copy.email}</p><a className="mt-1 block break-all text-primary hover:underline" href={`mailto:${broker.email}`}>{broker.email}</a></div> : null}
      {([[copy.mc, broker.mcNumber], [copy.address, broker.address]] as const).map(([label, value]) => value ? <div key={label}><p className="label-xs">{label}</p><p className="mt-1 whitespace-pre-wrap">{value}</p></div> : null)}
      {broker.notes ? <div className="sm:col-span-2 lg:col-span-3"><p className="label-xs">{copy.notes}</p><p className="mt-1 whitespace-pre-wrap text-sm">{broker.notes}</p></div> : null}
      {!broker.phone && !broker.email && !broker.mcNumber && !broker.address && !broker.notes ? <p className="text-sm text-muted-foreground">{copy.noContact}</p> : null}
    </CardContent></Card>
    <BrokerContactsCard brokerId={broker.id} brokerName={broker.name} contacts={contacts} canManage={canManage} />
    <Card><CardHeader><CardTitle>{copy.history}</CardTitle><span className="text-sm tnum">{loads.length} {copy.loads.toLowerCase()} · {formatMoney(loads.reduce((sum, load) => sum + load.grossRate, 0))}</span></CardHeader>
      <CardContent className="p-0">{!loads.length ? <p className="p-4 text-sm text-muted-foreground">{copy.noLoads}</p> : <div className="overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>{dictionary.loads.pickup}</TableHead><TableHead>{dictionary.drivers.load}</TableHead><TableHead>{dictionary.drivers.route}</TableHead><TableHead>{copy.bookedWith}</TableHead><TableHead className="text-right">{copy.revenue}</TableHead></TableRow></TableHeader>
        <TableBody>{loads.map((load) => <TableRow key={load.id}><TableCell>{formatLocaleDate(load.date, locale)}</TableCell><TableCell><Link className="text-primary hover:underline" href={`/loads/${load.id}`}>{load.loadNumber ?? load.id}</Link></TableCell><TableCell>{load.originCity}, {load.originState} → {load.destinationCity}, {load.destinationState}</TableCell><TableCell>{load.brokerContact?.trim() || <span className="text-muted-foreground">—</span>}</TableCell><TableCell className="text-right tnum">{formatMoney(load.grossRate)}</TableCell></TableRow>)}</TableBody>
      </Table></div>}</CardContent>
    </Card>
  </div>;
}
