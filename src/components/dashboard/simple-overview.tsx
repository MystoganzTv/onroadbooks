import { MiniStat } from "@/components/dashboard/mini-stat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/formatters";
import type { OwnerMoneyPresentation, MoneyValue } from "@/lib/finance/presentation";
import type { FinancialSummary } from "@/lib/types";
import type { WebDictionary } from "@/lib/i18n/dictionaries";

export function SimpleOverview({ summary, presentation, dictionary, showOwnerPlanning }: {
  summary: FinancialSummary;
  presentation: OwnerMoneyPresentation;
  dictionary: WebDictionary;
  showOwnerPlanning: boolean;
}) {
  const copy = dictionary.viewMode;
  const dashboard = dictionary.dashboard;
  const display = (value: MoneyValue) => value.state === "KNOWN" ? formatMoney(value.amount) : dashboard.notEnoughData;
  return (
    <>
      <section aria-label={copy.periodSummary} className="grid gap-3 sm:grid-cols-3">
        <MiniStat label={copy.revenue} value={formatMoney(summary.bookedRevenue)} sub={copy.revenueHint} tone="info" wrapText />
        <MiniStat label={copy.expenses} value={formatMoney(summary.operatingExpenses)} sub={copy.expensesHint} tone="negative" wrapText />
        <MiniStat label={copy.profit} value={formatMoney(summary.operatingProfit)} sub={copy.profitHint} tone={summary.operatingProfit >= 0 ? "positive" : "negative"} wrapText />
      </section>
      <Card>
        <CardHeader><div><CardTitle>{dashboard.yourCash}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{copy.cashHint}</p></div></CardHeader>
        <CardContent className="space-y-3">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div><dt className="text-sm text-muted-foreground">{dashboard.collectedLabel}</dt><dd className="mt-1 text-2xl font-semibold tnum">{display(presentation.answers.collected.value)}</dd></div>
            {showOwnerPlanning ? <div><dt className="text-sm text-muted-foreground">{dashboard.availableToYou}</dt><dd className="mt-1 text-2xl font-semibold text-info tnum">{display(presentation.availableToYou)}</dd><p className="mt-1 text-xs text-muted-foreground">{copy.availableHint}</p></div> : null}
          </dl>
          {presentation.cashFundingGap.state === "KNOWN" && presentation.cashFundingGap.amount > 0 ? <p className="text-sm font-medium text-neg">{dashboard.cashStillNeeded}: {formatMoney(presentation.cashFundingGap.amount)}</p> : null}
        </CardContent>
      </Card>
    </>
  );
}
