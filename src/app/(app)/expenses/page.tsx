import type { Metadata } from "next";
import Link from "next/link";
import { Fuel } from "lucide-react";
import { Button } from "@/components/ui/button";

import { RecurringExpensesDialog } from "@/components/expenses/recurring-expenses-dialog";
import { ViewModeToggle } from "@/components/shared/view-mode";
import { getViewMode } from "@/lib/view-mode-server";
import { activeRecurringExpenses } from "@/lib/recurring-expenses";
import { roleCan } from "@/lib/roles";
import { todayISO } from "@/lib/periods";
import { CategoryBreakdown } from "@/components/expenses/category-breakdown";
import { ExpenseFormDialog } from "@/components/expenses/expense-form-dialog";
import { ExpensesTable } from "@/components/expenses/expenses-table";
import { MiniStat } from "@/components/dashboard/mini-stat";
import { PeriodControls } from "@/components/dashboard/period-controls";
import { PageHeader } from "@/components/shared/page-header";
import { TruckSwitcher } from "@/components/fleet/truck-switcher";
import {
  categoryTotals,
  expensesInPeriod,
  loadsInPeriod,
  summarizePeriod,
  thresholdsFromSettings,
  withMetricsAll,
} from "@/lib/calculations";
import { requireSession } from "@/lib/auth";
import { getDataset } from "@/lib/db";
import { expenseMirrorSources } from "@/lib/mirrored-expenses";
import { formatMoneyCompact, formatPercent, formatRate } from "@/lib/formatters";
import { expensesForTruck, loadsForTruck, orderedTrucks } from "@/lib/fleet";
import { isOperatingExpense } from "@/lib/finance/terminology";
import { defaultEntryDate } from "@/lib/periods";
import { getWebDictionary, interpolate } from "@/lib/i18n/dictionaries";
import { getAppLocale } from "@/lib/i18n-server";
import {
  periodFromSearchParams,
  truckFromSearchParams,
  type SearchParams,
} from "@/lib/period-params";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).expenses.metadataTitle };
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [params, session, locale, mode] = await Promise.all([searchParams, requireSession(), getAppLocale(), getViewMode()]);
  const simple = mode === "simple";
  const copy = getWebDictionary(locale).expenses;
  const { trucks, loads, expenses, fuelEntries, maintenanceRecords, documents, settings, financialObligations, paymentEvents } = await getDataset(
    session.businessId,
  );
  const period = periodFromSearchParams(params);
  const ratingThresholds = thresholdsFromSettings(settings);

  // Scoping to a unit means its own costs only. Business overhead is not
  // divided between trucks -- it is subtracted once, on the Fleet page.
  const scopeTruckId = truckFromSearchParams(params, trucks);
  const scopedLoads = loadsForTruck(loads, scopeTruckId);
  const scopedExpenses = expensesForTruck(expenses, scopeTruckId);

  const periodExpenses = expensesInPeriod(scopedExpenses, period);
  const periodLoads = withMetricsAll(
    loadsInPeriod(scopedLoads, period),
    ratingThresholds,
    scopedExpenses,
  );
  const summary = summarizePeriod(scopedLoads, scopedExpenses, period, settings, paymentEvents);
  const operatingPeriodExpenses = periodExpenses.filter((expense) =>
    isOperatingExpense(expense),
  );
  const categories = categoryTotals(operatingPeriodExpenses, settings);

  const fixedShare =
    summary.operatingExpenses > 0 ? (summary.fixedExpenses / summary.operatingExpenses) * 100 : 0;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title={copy.title}
        description={interpolate(copy.periodEntries, {
          period: period.label,
          count: periodExpenses.length,
          unit: periodExpenses.length === 1 ? copy.entry : copy.entries,
        })}
        actions={
          <>
          <Button asChild size="sm" variant="outline"><Link href="/fuel"><Fuel />{getWebDictionary(locale).fuel.title}</Link></Button>
          <RecurringExpensesDialog schedules={activeRecurringExpenses(scopedExpenses, todayISO())} trucks={trucks} canManage={roleCan(session.role ?? "VIEWER", "manage_expenses")} />
          <ExpenseFormDialog
            loads={periodLoads}
            trucks={trucks}
            defaultTruckId={scopeTruckId}
            defaultDate={defaultEntryDate(period)}
            categoryBehavior={settings.categoryBehavior}
          />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <PeriodControls period={period} />
        <TruckSwitcher trucks={orderedTrucks(trucks)} selectedId={scopeTruckId} />
        <div className="sm:ml-auto"><ViewModeToggle /></div>
      </div>

      <section
        aria-label={copy.summaryLabel}
        className={simple ? "grid grid-cols-2 gap-3" : "grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6"}
      >
        {simple ? <MiniStat label={copy.totalRecorded} value={formatMoneyCompact(summary.operatingExpenses + summary.debtService)} /> : null}
        {!simple || summary.debtService > 0 ? <MiniStat
          label={copy.operatingExpenses}
          value={formatMoneyCompact(summary.operatingExpenses)}
          tone="negative"
        /> : null}
        {!simple || summary.debtService > 0 ? <MiniStat
          label={copy.debtService}
          value={formatMoneyCompact(summary.debtService)}
          tone={summary.debtService > 0 ? "negative" : "neutral"}
          sub={copy.debtServiceDetail}
        /> : null}
        {!simple ? <>
        <MiniStat
          label={copy.fixed}
          value={formatMoneyCompact(summary.fixedExpenses)}
          sub={interpolate(copy.shareOfSpend, { share: formatPercent(fixedShare) })}
          tone="info"
        />
        <MiniStat
          label={copy.variable}
          value={formatMoneyCompact(summary.variableExpenses)}
          sub={interpolate(copy.shareOfSpend, { share: formatPercent(100 - fixedShare) })}
          tone="warning"
        />
        <MiniStat label={copy.fuel} value={formatMoneyCompact(summary.fuelExpense)} />
        </> : null}
        <MiniStat
          label={copy.actualCostPerMile}
          value={formatRate(summary.costPerMile)}
          tone="negative"
          sub={copy.operatingOnly}
        />
      </section>


      <div className={simple ? "space-y-4" : "grid gap-4 xl:grid-cols-3"}>
        <div className="min-w-0 xl:col-span-2">
          <ExpensesTable
            expenses={periodExpenses}
            mirrorSources={expenseMirrorSources({ expenses, fuelEntries, maintenanceRecords })}
            documents={documents}
            loads={periodLoads}
            categoryBehavior={settings.categoryBehavior}
            defaultDate={defaultEntryDate(period)}
            trucks={trucks}
            defaultTruckId={scopeTruckId}
            obligations={financialObligations}
          />
        </div>
        {!simple ? <CategoryBreakdown
          categories={categories}
          total={summary.operatingExpenses}
          locale={locale}
          copy={copy}
        /> : null}
      </div>
    </div>
  );
}
