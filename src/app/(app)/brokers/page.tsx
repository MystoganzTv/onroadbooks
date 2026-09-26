import Link from "next/link";
import { Building2 } from "lucide-react";
import { BrokerFormDialog } from "@/components/brokers/broker-form-dialog";
import { MoveBrokerNameDialog } from "@/components/brokers/move-broker-name-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireSession } from "@/lib/auth";
import { getDataset } from "@/lib/db";
import { brokerContactsOf, brokerNameKey, brokerNames, contactPhoneHref, contactPhoneLabel } from "@/lib/brokers";
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
  const profiles = [...(dataset.brokers ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const profileKeys = new Set(profiles.map((broker) => broker.nameKey));
  const loadsFor = (name: string) => dataset.loads.filter((load) => brokerNameKey(load.broker ?? "") === brokerNameKey(name));
  // Names typed on loads that have no profile. Usually a person at a broker
  // entered in the Broker field; sometimes a company not set up yet.
  const unfiled = brokerNames(dataset.loads).filter((name) => !profileKeys.has(brokerNameKey(name)));
  const targets = profiles.map((broker) => ({ id: broker.id, name: broker.name }));

  return <div className="space-y-4 p-4 lg:p-6">
    <PageHeader title={copy.title} description={copy.description} actions={canManage ? <BrokerFormDialog /> : undefined} />
    <Card><CardContent className="p-0">
      {profiles.length === 0 ? <EmptyState icon={Building2} title={copy.noBrokers} description={copy.noBrokersDescription} /> : <div className="overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>{copy.name}</TableHead><TableHead>{copy.contacts}</TableHead><TableHead>{copy.phone}</TableHead><TableHead className="text-right">{copy.loads}</TableHead><TableHead className="text-right">{copy.revenue}</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>{profiles.map((profile) => {
          const loads = loadsFor(profile.name);
          const people = brokerContactsOf(profile);
          return <TableRow key={profile.id} className="align-top">
            <TableCell><Link className="font-medium text-primary hover:underline" href={`/brokers/${profile.id}`}>{profile.name}</Link>{profile.mcNumber ? <p className="text-2xs text-muted-foreground">{profile.mcNumber}</p> : null}</TableCell>
            <TableCell>{people.length ? <ul className="space-y-1">
              {people.slice(0, 4).map((person) => <li key={person.id} className="leading-tight">
                <span className="text-sm">{person.name}</span>
                {person.phone || person.phoneExtension ? <a className="ml-2 whitespace-nowrap text-2xs text-primary hover:underline" href={contactPhoneHref({ phone: person.phone ?? profile.phone, phoneExtension: person.phoneExtension })}>{person.phone && person.phone !== profile.phone ? contactPhoneLabel(person) : person.phoneExtension ? `ext. ${person.phoneExtension}` : person.phone}</a> : null}
              </li>)}
              {people.length > 4 ? <li className="text-2xs text-muted-foreground">+{people.length - 4}</li> : null}
            </ul> : <span className="text-muted-foreground">—</span>}</TableCell>
            <TableCell>{profile.phone ? <a className="whitespace-nowrap text-primary hover:underline" href={`tel:${profile.phone}`}>{profile.phone}</a> : "—"}</TableCell>
            <TableCell className="text-right tnum">{loads.length}</TableCell><TableCell className="text-right tnum">{formatMoney(loads.reduce((sum, load) => sum + load.grossRate, 0))}</TableCell>
            <TableCell className="text-right"><Button asChild variant="ghost" size="sm"><Link href={`/brokers/${profile.id}`}>{copy.profile}</Link></Button></TableCell>
          </TableRow>;
        })}</TableBody>
      </Table></div>}
    </CardContent></Card>

    {unfiled.length ? <Card>
      <CardHeader>
        <CardTitle>{copy.unfiledTitle}</CardTitle>
        <p className="text-xs text-muted-foreground">{copy.unfiledHint}</p>
      </CardHeader>
      <CardContent className="p-0"><ul className="divide-y divide-border">
        {unfiled.map((name) => {
          const loads = loadsFor(name);
          return <li key={brokerNameKey(name)} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{name}</p>
              <p className="text-2xs text-muted-foreground tnum">{loads.length} {copy.loads.toLowerCase()} · {formatMoney(loads.reduce((sum, load) => sum + load.grossRate, 0))}</p>
            </div>
            {canManage ? <div className="flex flex-wrap gap-2">
              <MoveBrokerNameDialog name={name} loadCount={loads.length} brokers={targets} />
              <BrokerFormDialog initialName={name} trigger={<Button variant="ghost" size="sm">{copy.createProfile}</Button>} />
            </div> : null}
          </li>;
        })}
      </ul></CardContent>
    </Card> : null}
  </div>;
}
