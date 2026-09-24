import Link from "next/link";
import { Building2 } from "lucide-react";
import { BrokerFormDialog } from "@/components/brokers/broker-form-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSession } from "@/lib/auth";
import { getDataset } from "@/lib/db";
import { brokerNameKey, brokerNames } from "@/lib/brokers";
import { getAppLocale } from "@/lib/i18n-server";
import { getWebDictionary } from "@/lib/i18n/dictionaries";
import { formatMoney } from "@/lib/formatters";
import { roleCan } from "@/lib/roles";

export const metadata = { title: "Brokers" };

export default async function BrokersPage() {
  const [session, locale] = await Promise.all([requireSession(), getAppLocale()]);
  const dataset = await getDataset(session.businessId);
  const copy = getWebDictionary(locale).brokers;
  const canManage = roleCan(session.role ?? "VIEWER", "manage_loads");
  const profiles = new Map((dataset.brokers ?? []).map((broker) => [broker.nameKey, broker]));
  const names = brokerNames(dataset.loads, dataset.brokers);
  return <div className="space-y-4 p-4 lg:p-6">
    <PageHeader title={copy.title} description={copy.description} actions={canManage ? <BrokerFormDialog /> : undefined} />
    <Card><CardContent className="p-0">
      {names.length === 0 ? <EmptyState icon={Building2} title={copy.noBrokers} description={copy.noBrokersDescription} /> : <div className="overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>{copy.name}</TableHead><TableHead>{copy.contact}</TableHead><TableHead>{copy.phone}</TableHead><TableHead>{copy.email}</TableHead><TableHead className="text-right">{copy.loads}</TableHead><TableHead className="text-right">{copy.revenue}</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>{names.map((name) => {
          const profile = profiles.get(brokerNameKey(name));
          const loads = dataset.loads.filter((load) => brokerNameKey(load.broker ?? "") === brokerNameKey(name));
          return <TableRow key={brokerNameKey(name)}>
            <TableCell>{profile ? <Link className="font-medium text-primary hover:underline" href={`/brokers/${profile.id}`}>{name}</Link> : <span className="font-medium">{name}</span>}</TableCell>
            <TableCell>{profile?.contactName ?? "—"}</TableCell>
            <TableCell>{profile?.phone ? <a className="text-primary hover:underline" href={`tel:${profile.phone}`}>{profile.phone}</a> : "—"}</TableCell>
            <TableCell>{profile?.email ? <a className="text-primary hover:underline" href={`mailto:${profile.email}`}>{profile.email}</a> : "—"}</TableCell>
            <TableCell className="text-right tnum">{loads.length}</TableCell><TableCell className="text-right tnum">{formatMoney(loads.reduce((sum, load) => sum + load.grossRate, 0))}</TableCell>
            <TableCell>{profile ? <Button asChild variant="ghost" size="sm"><Link href={`/brokers/${profile.id}`}>{copy.profile}</Link></Button> : canManage ? <BrokerFormDialog initialName={name} trigger={<Button variant="outline" size="sm">{copy.addContact}</Button>} /> : null}</TableCell>
          </TableRow>;
        })}</TableBody>
      </Table></div>}
    </CardContent></Card>
  </div>;
}
