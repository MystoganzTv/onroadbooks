import type { Metadata } from "next";
import Link from "next/link";

import { SettlementDetail } from "@/components/settlements/settlement-detail";
import { PageHeader } from "@/components/shared/page-header";
import { PlanGate } from "@/components/shared/plan-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { planAllows } from "@/lib/plans";
import { calculateSettlement, settlementWindows } from "@/lib/finance/settlement";
import { formatMoneyCompact, formatPercent, formatRateValue } from "@/lib/formatters";
import { param, type SearchParams } from "@/lib/period-params";
import { currentMonth, shiftMonth, todayISO } from "@/lib/periods";
import type { SettlementHalf } from "@/lib/types";
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
  const dataset = await getRepository(session.businessId).getDataset();
  const { loads, expenses, settings, reserveAccounts, settlements } = dataset;

  if (!planAllows(dataset.subscription, "cockpit")) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <PageHeader
          title="Settlements"
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
    ),
  );

  // Default to the most recent window that has actually finished; that is the
  // one the owner is here to settle.
  const selected =
    views.find(
      (view) =>
        view.month === monthParam &&
        (halfParam === "FIRST" || halfParam === "SECOND") &&
        view.half === (halfParam as SettlementHalf),
    ) ??
    views.find((view) => view.complete) ??
    views[0];

  const history = views.filter(
    (view) => view.id !== selected?.id && (view.status === "CLOSED" || view.figures.loadCount > 0),
  );

  const closedCount = views.filter((v) => v.status === "CLOSED").length;
  const openComplete = views.filter((v) => v.status === "OPEN" && v.complete && v.figures.loadCount > 0);

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title="Settlements"
        description="Twice a month, the truck settles up: what came in, what went out, what is safe to take."
      />

      {openComplete.length > 0 ? (
        <div className="rounded-lg border border-info/40 bg-info-soft/50 px-4 py-3">
          <p className="text-xs text-foreground">
            {openComplete.length} finished{" "}
            {openComplete.length === 1 ? "period is" : "periods are"} still open.{" "}
            {openComplete.length === 1
              ? "Closing it freezes the figures and posts its reserves."
              : "Closing them freezes their figures and posts their reserves."}
          </p>
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
                  {history.map((view) => (
                    <li key={view.id}>
                      <Link
                        href={`/settlements?month=${view.month}&half=${view.half}`}
                        className="block px-4 py-2.5 transition-colors hover:bg-accent/50 focus-ring"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="min-w-0 truncate text-xs font-medium text-foreground">
                            {view.shortLabel}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 tnum text-sm font-semibold",
                              view.figures.safeToPay >= 0 ? "text-pos" : "text-neg",
                            )}
                          >
                            {formatMoneyCompact(view.figures.safeToPay)}
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
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
