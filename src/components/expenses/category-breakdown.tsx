import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryDonut } from "@/components/charts/category-donut";
import { PrintDonut } from "@/components/print/print-charts";
import { EmptyState } from "@/components/shared/empty-state";
import { PieChart } from "lucide-react";
import { categoryColor, categoryLabel } from "@/lib/categories";
import { formatMoney, formatPercent } from "@/lib/formatters";
import type { AppLocale } from "@/lib/i18n";
import { interpolate, type WebDictionary } from "@/lib/i18n/dictionaries";
import type { CategoryTotal } from "@/lib/types";

interface CategoryBreakdownProps {
  categories: CategoryTotal[];
  total: number;
  locale: AppLocale;
  copy: WebDictionary["expenses"];
}

export function CategoryBreakdown({ categories, total, locale, copy }: CategoryBreakdownProps) {
  if (categories.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{copy.categoryBreakdown}</CardTitle>
        </CardHeader>
        <EmptyState
          icon={PieChart}
          title={copy.nothingToBreakDown}
          description={copy.breakdownDescription}
          compact
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.categoryBreakdown}</CardTitle>
        <span className="text-2xs text-muted-foreground">
          {interpolate(copy.categoryCount, { count: categories.length, unit: categories.length === 1 ? copy.categoryUnit : copy.categoryUnits })}
        </span>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="print:hidden">
          <CategoryDonut data={categories} total={total} />
        </div>
        <div className="hidden justify-center print:flex">
          <PrintDonut data={categories} total={total} />
        </div>

        <ul className="space-y-1.5">
          {categories.map((category) => (
            <li key={category.category}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-[2px]"
                    style={{ background: categoryColor(category.category) }}
                    aria-hidden
                  />
                  <span className="truncate">{categoryLabel(category.category, locale)}</span>
                </span>
                <span className="flex shrink-0 items-baseline gap-2 tnum">
                  <span className="text-muted-foreground">{formatPercent(category.share)}</span>
                  <span className="w-[4.75rem] text-right font-medium">
                    {formatMoney(category.amount)}
                  </span>
                </span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-sunken">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(category.share, 1)}%`,
                    background: categoryColor(category.category),
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
