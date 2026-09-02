import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { SettlementDetail } from "@/components/settlements/settlement-detail";
import { PageHeader } from "@/components/shared/page-header";
import { PlanGate } from "@/components/shared/plan-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { planAllows } from "@/lib/plans";
import { roleCan } from "@/lib/roles";
import {
  calculateSettlement,
  selectSettlementView,
  settlementWindows,
} from "@/lib/finance/settlement";
import { selectOwnerMoneyPresentation } from "@/lib/finance/presentation";
import { formatMoneyCompact, formatPercent, formatRateValue } from "@/lib/formatters";
import { formatLocaleDate } from "@/lib/i18n-format";
import { getWebDictionary, interpolate } from "@/lib/i18n/dictionaries";
import { getAppLocale } from "@/lib/i18n-server";
import { param, type SearchParams } from "@/lib/period-params";
import { currentMonth, shiftMonth, todayISO } from "@/lib/periods";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).settlements.metadataTitle };
}

/** How far back the history list reaches. */
const HISTORY_MONTHS = 11;

/**
 * SETTLEMENTS
 * ===========
 *
 * The twice-monthly review: 1st-15th and 16th to month end. Open settlements
 * recompute live; closed ones render the snapshot frozen at close, so
 * changing a reserve percentage next month never rewrites what the owner
 * already settled on.
 */
export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [params, session, locale] = await Promise.all([
    searchParams,
    requireSession(),
    getAppLocale(),
  ]);
  const copy = getWebDictionary(locale).settlements;
  if (!roleCan(session.role ?? "VIEWER", "manage_owner_finances")) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <PageHeader title={copy.title} description={copy.ownerDescription} />
        <Card className="mx-auto max-w-2xl">
          <CardContent className="p-6 text-sm leading-relaxed text-muted-foreground">
            {copy.ownerOnly}
          </CardContent>
        </Card>
      </div>
    );
  }
  const dataset = await getRepository(session.businessId).getDataset();
  const { loads, expenses, settings, reserveAccounts, settlements } = dataset;

  if (!planAllows(dataset.subscription, "cockpit")) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <PageHeader
          title={copy.title}
          description={copy.gateDescription}
        />
        <PlanGate
          capability="cockpit"
          what={copy.gateWhat}
        />
      </div>
    );
  }

  const today = todayISO();
  const anchorMonth = currentMonth();
  const monthParam = param(params, "month");
  const halfParam = param(params, "half").toUpperCase();

  const windows = settlementWindows(shiftMonth(anchorMonth, -HISTORY_MONTHS), anchorMonth);
  const views = windows.map((window) =>
    calculateSettlement(
      window.month,
      window.half,
      loads,
      expenses,
      settings,
      reserveAccounts,
      settlements.find((s) => s.month === window.month && s.half === window.half),
      today,
      dataset.paymentEvents,
    ),
  );

  const selected = selectSettlementView(views, monthParam, halfParam);

  const history = views.filter(
    (view) => view.id !== selected?.id && (view.status === "CLOSED" || view.figures.loadCount > 0),
  );

  const closedCount = views.filter((v) => v.status === "CLOSED").length;
  const openComplete = views.filter((v) => v.status === "OPEN" && v.complete && v.figures.loadCount > 0);

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
      />

      {openComplete.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-lg border border-info/40 bg-info-soft/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-foreground">
              {interpolate(copy.readyCount, {
                count: openComplete.length,
                unit: openComplete.length === 1 ? copy.payday : copy.paydays,
              })}
            </p>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              {copy.readyDescription}
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href={`/settlements?month=${openComplete[0].month}&half=${openComplete[0].half}`}>
              {copy.reviewPayday}
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          {selected ? (
            <SettlementDetail view={selected} />
          ) : (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                {copy.noPeriods}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="min-w-0">
          <Card>
            <CardHeader>
              <CardTitle>{copy.history}</CardTitle>
              <span className="text-2xs text-muted-foreground tnum">
                {interpolate(copy.closedCount, { count: closedCount })}
              </span>
            </CardHeader>
            <CardContent className="p-0">
              {history.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">
                  {copy.noHistory}
                </p>
              ) : (
                <ul className="divide-y divide-border/70">
                  {history.map((view) => {
                    const presentation = selectOwnerMoneyPresentation({
                      bookedRevenue: view.figures.bookedRevenue ?? view.figures.grossRevenue,
                      operatingProfit: view.figures.operatingProfit,
                      collectedRevenue: view.figures.collectedRevenue ?? null,
                      accountsReceivable: view.figures.accountsReceivable ?? null,
                      unallocatedCollectedRevenue: view.figures.unallocatedCollectedRevenue ?? null,
                      operatingExpenses: view.figures.operatingExpenses,
                      debtService: view.figures.debtService ?? null,
                      reserveTotal: view.figures.reserveTotal,
                      safeToPay: view.figures.safeToPay,
                    });
                    return <li key={view.id}>
                      <Link
                        href={`/settlements?month=${view.month}&half=${view.half}`}
                        className="block px-4 py-2.5 transition-colors hover:bg-accent/50 focus-ring"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="min-w-0 truncate text-xs font-medium text-foreground">
                            {formatLocaleDate(view.range.start, locale, {
                              month: "short",
                              day: "numeric",
                            })}
                            –{formatLocaleDate(view.range.end, locale, { day: "numeric" })}
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-[0.625rem] uppercase tracking-wide text-muted-foreground">{copy.available}</span>
                            <span className={cn("block tnum text-sm font-semibold", presentation.availableToYou.state === "KNOWN" && presentation.availableToYou.amount > 0 ? "text-pos" : "text-info")}>
                              {presentation.availableToYou.state === "KNOWN"
                                ? formatMoneyCompact(presentation.availableToYou.amount)
                                : copy.unknown}
                            </span>
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          <span className="truncate text-2xs text-muted-foreground tnum">
                            {interpolate(copy.historyRead, {
                              revenue: formatMoneyCompact(view.figures.grossRevenue),
                              count: view.figures.loadCount,
                              rate: formatRateValue(view.figures.profitPerMile),
                              deadhead: formatPercent(view.figures.deadheadPct, 0),
                            })}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded border px-1 py-0.5 text-2xs font-medium uppercase",
                              view.status === "CLOSED"
                                ? "border-pos/40 bg-pos-soft text-pos"
                                : "border-border text-muted-foreground",
                            )}
                          >
                            {view.status === "CLOSED" ? copy.closed : copy.open}
                          </span>
                        </div>
                      </Link>
                    </li>;
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
