import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { SettlementDetail } from "@/components/settlements/settlement-detail";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/auth";
import { getDataset } from "@/lib/db";
import { calculateSettlement } from "@/lib/finance/settlement";
import { getAppLocale } from "@/lib/i18n-server";
import { getWebDictionary } from "@/lib/i18n/dictionaries";
import { roleCan } from "@/lib/roles";
import { todayISO } from "@/lib/periods";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getWebDictionary(await getAppLocale()).reports.savedStatements };
}

export default async function SavedStatementsPage() {
  const [session, locale] = await Promise.all([requireSession(), getAppLocale()]);
  if (!roleCan(session.role ?? "VIEWER", "manage_owner_finances")) redirect("/reports");
  const dataset = await getDataset(session.businessId);
  const copy = getWebDictionary(locale).reports;
  const saved = dataset.settlements.filter((statement) => statement.status === "CLOSED" && statement.snapshot)
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  return <div className="space-y-4 p-4 lg:p-6">
    <PageHeader title={copy.savedStatements} description={copy.savedStatementsHint} actions={<Button asChild variant="outline" size="sm"><Link href="/reports"><ArrowLeft />{copy.title}</Link></Button>} />
    {saved.length === 0 ? <p className="py-8 text-sm text-muted-foreground">{copy.noSavedStatements}</p> : saved.map((statement) =>
      <SettlementDetail key={statement.id} readOnly view={calculateSettlement(statement.month, statement.half, dataset.loads, dataset.expenses, dataset.settings, dataset.reserveAccounts, statement, todayISO(), dataset.paymentEvents)} />
    )}
  </div>;
}
