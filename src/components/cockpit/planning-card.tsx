import { Gauge } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMiles, formatMoneyCompact, formatRateValue } from "@/lib/formatters";
import type { FinancialPlanningSummary } from "@/lib/finance/planning";

export function PlanningCard({ planning }: { planning: FinancialPlanningSummary }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <div className="flex items-center gap-2"><Gauge className="size-3.5 text-muted-foreground" /><CardTitle>Monthly planning</CardTitle></div>
        <span className="text-2xs text-muted-foreground">Normalized operating basis, financing separate</span>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 p-4">
        <Metric label="Expected miles" value={formatMiles(planning.expectedMonthlyMiles)} />
        <Metric label="Normalized cost / mi" value={formatRateValue(planning.normalizedCostPerMile)} />
        <Metric label="Operating break-even" value={formatMoneyCompact(planning.operatingBreakEvenRevenue)} />
        <Metric label="Cash break-even" value={formatMoneyCompact(planning.cashBreakEvenRevenue)} />
        <Metric label="Monthly obligations" value={formatMoneyCompact(planning.activeMonthlyObligations)} />
        <Metric label="Obligation coverage" value={planning.activeMonthlyObligations > 0 ? `${planning.fixedObligationCoverage.toFixed(2)}×` : "—"} />
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="label-xs">{label}</p><p className="mt-0.5 tnum text-base font-semibold">{value}</p></div>;
}
