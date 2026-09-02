"use client";

import Link from "next/link";
import { ArrowRight, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/shell/language-provider";
import { formatMoneyCompact, formatNumber } from "@/lib/formatters";
import type { ActionableProblem } from "@/lib/finance/presentation";
import { cn } from "@/lib/utils";

export function ActionableProblemBanner({
  problem,
  compact = false,
}: {
  problem: ActionableProblem;
  compact?: boolean;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.problems;
  const localized = (() => {
    switch (problem.id) {
      case "payment-dates":
        return {
          headline: copy.paymentDatesHeadline,
          what: problem.count
            ? copy.paymentDatesWhatCount
                .replace("{count}", String(problem.count))
                .replace("{unit}", problem.count === 1 ? copy.load : copy.loads)
            : copy.paymentDatesWhat,
          why: copy.paymentDatesWhy,
          action: copy.paymentDatesAction,
        };
      case "unclassified-debt":
        return { headline: copy.debtHeadline, what: copy.debtWhat, why: copy.debtWhy, action: copy.debtAction };
      case "missing-fuel-details":
        return { headline: copy.fuelHeadline, what: copy.fuelWhat, why: copy.fuelWhy, action: copy.fuelAction };
      case "missing-broker-customer":
        return { headline: copy.customerHeadline, what: copy.customerWhat, why: copy.customerWhy, action: copy.customerAction };
      case "missing-invoice":
        return { headline: copy.invoiceHeadline, what: copy.invoiceWhat, why: copy.invoiceWhy, action: copy.invoiceAction };
      case "missing-ifta-records":
        return { headline: copy.iftaHeadline, what: copy.iftaWhat, why: copy.iftaWhy, action: copy.iftaAction };
      case "reserve-funding-gap":
        return { headline: copy.reserveHeadline, what: copy.reserveWhat, why: copy.reserveWhy, action: copy.reserveAction };
    }
  })();
  const prefix = problem.amount !== null
    ? `${formatMoneyCompact(problem.amount)} `
    : problem.count !== null
      ? `${formatNumber(problem.count)} `
      : "";

  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border",
        problem.severity === "critical"
          ? "border-neg/35 bg-neg-soft/35"
          : "border-warn/35 bg-warn-soft/35",
      )}
    >
      <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", compact ? "px-3 py-2.5" : "px-4 py-3.5")}>
        <div className="flex min-w-0 items-start gap-3">
          <TriangleAlert
            className={cn(
              "mt-0.5 size-4 shrink-0",
              problem.severity === "critical" ? "text-neg" : "text-warn",
            )}
            aria-hidden
          />
          <div className="min-w-0">
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-foreground tnum">
              {prefix}{localized.headline}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-foreground/90">{localized.what}</p>
            {!compact ? (
              <p className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">
                {localized.why}
              </p>
            ) : null}
          </div>
        </div>
        <Button asChild size="sm" variant="outline" className="shrink-0">
          <Link href={problem.action.href}>
            {localized.action}
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

export function ActionableProblemList({ problems }: { problems: ActionableProblem[] }) {
  const { dictionary } = useLanguage();
  if (problems.length === 0) return null;
  return (
    <div className="space-y-2" aria-label={dictionary.problems.aria}>
      {problems.map((problem) => (
        <ActionableProblemBanner key={problem.id} problem={problem} />
      ))}
    </div>
  );
}
