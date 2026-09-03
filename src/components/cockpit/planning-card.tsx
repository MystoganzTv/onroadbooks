"use client";

import { Gauge } from "lucide-react";

import { useLanguage } from "@/components/shell/language-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMiles, formatMoneyCompact, formatRateValue } from "@/lib/formatters";
import type { FinancialPlanningSummary } from "@/lib/finance/planning";

export function PlanningCard({ planning }: { planning: FinancialPlanningSummary }) {
  const { dictionary } = useLanguage();
  const copy = dictionary.dashboard;
  const hasExpectedMiles = planning.expectedMonthlyMiles > 0;
  return (
    <Card className="min-w-0" data-testid="monthly-planning">
      <CardHeader>
        <div className="flex items-center gap-2"><Gauge className="size-3.5 text-muted-foreground" /><CardTitle>{copy.monthlyPlanning}</CardTitle></div>
        <span className="text-2xs text-muted-foreground">{copy.normalizedBasis}</span>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 p-4">
        <Metric label={copy.expectedMiles} value={formatMiles(planning.expectedMonthlyMiles)} />
        <Metric label={copy.normalizedCostMile} value={formatRateValue(planning.normalizedCostPerMile)} />
        <Metric
          label={copy.operatingBreakEven}
          value={hasExpectedMiles ? formatMoneyCompact(planning.operatingBreakEvenRevenue) : copy.unavailable}
          hint={hasExpectedMiles ? undefined : copy.configureExpectedMiles}
        />
        <Metric
          label={copy.cashBreakEven}
          value={hasExpectedMiles ? formatMoneyCompact(planning.cashBreakEvenRevenue) : copy.unavailable}
          hint={hasExpectedMiles ? undefined : copy.configureExpectedMiles}
        />
        <Metric label={copy.monthlyObligations} value={formatMoneyCompact(planning.activeMonthlyObligations)} />
        <Metric label={copy.obligationCoverage} value={planning.activeMonthlyObligations > 0 ? `${planning.fixedObligationCoverage.toFixed(2)}×` : "—"} />
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div aria-label={`${label}: ${value}${hint ? ` — ${hint}` : ""}`}>
      <p className="label-xs">{label}</p>
      <p className="mt-0.5 tnum text-base font-semibold">{value}</p>
      {hint ? <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">— {hint}</p> : null}
    </div>
  );
}
