import type { Metadata } from "next";

import { CategoryBreakdown } from "@/components/expenses/category-breakdown";
import { ExpenseFormDialog } from "@/components/expenses/expense-form-dialog";
import { ExpensesTable } from "@/components/expenses/expenses-table";
import { MiniStat } from "@/components/dashboard/mini-stat";
import { PeriodControls } from "@/components/dashboard/period-controls";
import { PageHeader } from "@/components/shared/page-header";
import {
  categoryTotals,
  expensesInPeriod,
  loadsInPeriod,
  summarizePeriod,
  thresholdsFromSettings,
  withMetricsAll,
} from "@/lib/calculations";
import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { formatMoneyCompact, formatPercent, formatRate } from "@/lib/formatters";
import { defaultEntryDate } from "@/lib/periods";
import { periodFromSearchParams, type SearchParams } from "@/lib/period-params";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const session = await requireSession();
  const { loads, expenses, documents, settings } = await getRepository(session.businessId).getDataset();
  const period = periodFromSearchParams(params);
  const ratingThresholds = thresholdsFromSettings(settings);

  const periodExpenses = expensesInPeriod(expenses, period);
  const periodLoads = withMetricsAll(loadsInPeriod(loads, period), ratingThresholds);
  const summary = summarizePeriod(loads, expenses, period, settings);
  const categories = categoryTotals(periodExpenses, settings);

  const fixedShare =
    summary.operatingExpenses > 0 ? (summary.fixedExpenses / summary.operatingExpenses) * 100 : 0;

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title="Expenses"
        description={`${period.label} - ${periodExpenses.length} ${periodExpenses.length === 1 ? "entry" : "entries"}`}
        actions={
          <ExpenseFormDialog
            loads={periodLoads}
            defaultDate={defaultEntryDate(period)}
            categoryBehavior={settings.categoryBehavior}
          />
        }
      />

      <PeriodControls period={period} />

      <section
        aria-label="Expense summary"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      >
        <MiniStat
          label="Total Expenses"
          value={formatMoneyCompact(summary.operatingExpenses)}
          tone="negative"
        />
        <MiniStat
          label="Fixed"
          value={formatMoneyCompact(summary.fixedExpenses)}
          sub={`${formatPercent(fixedShare)} of spend`}
          tone="info"
        />
        <MiniStat
          label="Variable"
          value={formatMoneyCompact(summary.variableExpenses)}
          sub={`${formatPercent(100 - fixedShare)} of spend`}
          tone="warning"
        />
        <MiniStat label="Fuel" value={formatMoneyCompact(summary.fuelExpense)} />
        <MiniStat
          label="Cost / Mile"
          value={formatRate(summary.costPerMile)}
          tone="negative"
          sub="all expenses"
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <ExpensesTable
            expenses={periodExpenses}
            documents={documents}
            loads={periodLoads}
            categoryBehavior={settings.categoryBehavior}
            defaultDate={defaultEntryDate(period)}
          />
        </div>
        <CategoryBreakdown categories={categories} total={summary.operatingExpenses} />
      </div>
    </div>
  );
}
