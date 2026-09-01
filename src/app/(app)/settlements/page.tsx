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
import { param, type SearchParams } from "@/lib/period-params";
import { currentMonth, shiftMonth, todayISO } from "@/lib/periods";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Settlements" };

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
  const params = await searchParams;
  const session = await requireSession();
  if (!roleCan(session.role ?? "VIEWER", "manage_owner_finances")) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <PageHeader title="Owner Settlements" description="Owner-only closeout workspace." />
        <Card className="mx-auto max-w-2xl">
          <CardContent className="p-6 text-sm leading-relaxed text-muted-foreground">
            Safe to Pay Yourself and Owner Settlement close/reopen controls are available only to
            the workspace owner.
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
          title="Owner Settlements"
          description="The twice-monthly review: 1-15 and 16 to month end."
        />
        <PlanGate
          capability="cockpit"
          what="Close the half-month, freeze the figures you settled on, and post the reserve contributions they imply."
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
        title="Owner Settlements"
        description="Your half-month payday: what the truck earned, what the business kept, and what is available to you."
      />

      {openComplete.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-lg border border-info/40 bg-info-soft/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-foreground">
              {openComplete.length} finished {openComplete.length === 1 ? "payday is" : "paydays are"} ready to review
            </p>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              Review the money, then settle the period to freeze its figures and post its reserves.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href={`/settlements?month=${openComplete[0].month}&half=${openComplete[0].half}`}>
              Review payday
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
                No settlement periods yet.
              </CardContent>
            </Card>
          )}
        </div>

        <div className="min-w-0">
          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
              <span className="text-2xs text-muted-foreground tnum">
                {closedCount} closed
              </span>
            </CardHeader>
            <CardContent className="p-0">
              {history.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">
                  Settlements appear here once a half-month has activity.
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
                            {view.shortLabel}
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-[0.625rem] uppercase tracking-wide text-muted-foreground">Available</span>
                            <span className={cn("block tnum text-sm font-semibold", presentation.availableToYou.state === "KNOWN" && presentation.availableToYou.amount > 0 ? "text-pos" : "text-info")}>
                              {presentation.availableToYou.state === "KNOWN"
                                ? formatMoneyCompact(presentation.availableToYou.amount)
                                : "Unknown"}
                            </span>
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          <span className="truncate text-2xs text-muted-foreground tnum">
                            {formatMoneyCompact(view.figures.grossRevenue)} rev ·{" "}
                            {view.figures.loadCount} loads ·{" "}
                            {formatRateValue(view.figures.profitPerMile)}/mi ·{" "}
                            {formatPercent(view.figures.deadheadPct, 0)} DH
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded border px-1 py-0.5 text-2xs font-medium uppercase",
                              view.status === "CLOSED"
                                ? "border-pos/40 bg-pos-soft text-pos"
                                : "border-border text-muted-foreground",
                            )}
                          >
                            {view.status === "CLOSED" ? "Closed" : "Open"}
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
