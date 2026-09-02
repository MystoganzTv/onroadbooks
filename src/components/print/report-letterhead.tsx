"use client";

import { useLanguage } from "@/components/shell/language-provider";
import { formatMoney, formatMoneyCompact, formatPercent, formatRateValue } from "@/lib/formatters";
import { interpolate } from "@/lib/i18n/dictionaries";
import { formatLocaleNumber } from "@/lib/i18n-format";
import type { PeriodSummary } from "@/lib/types";
import { APP_NAME } from "@/lib/utils";

interface ReportLetterheadProps {
  businessName: string;
  truckName: string;
  periodLabel: string;
  comparisonLabel: string;
  rangeLabel: string;
  generatedAt: string;
  summary: PeriodSummary;
}

/**
 * The cover of the printed report.
 *
 * Invisible on screen: the app already has a page header, a sidebar and a
 * period control, and none of that belongs on paper. On paper the document
 * has to arrive as something OnRoad Books produced -- the masthead reversed
 * out of the brand navy, the period set large, then the four numbers the
 * rest of the report exists to explain.
 *
 * Colours are literal here rather than tokens: a printed page is always
 * light, whatever the app is set to, and these have to survive a browser
 * that has been told not to print backgrounds.
 */
export function ReportLetterhead({
  businessName,
  truckName,
  periodLabel,
  comparisonLabel,
  rangeLabel,
  generatedAt,
  summary,
}: ReportLetterheadProps) {
  const { dictionary, locale } = useLanguage();
  const copy = dictionary.reports;
  const profitable = summary.operatingProfit >= 0;

  return (
    <header className="hidden print:block">
      {/* The masthead band. Printed as a filled block, so it also carries a
          heavy bottom rule underneath for the case where a browser has been
          told to drop background colour entirely. */}
      <div className="flex items-stretch justify-between gap-8 bg-[#0F1E38] px-6 py-5 text-white">
        <div className="flex flex-col justify-between">
          <div>
            <p className="text-[12pt] font-bold uppercase leading-none tracking-[0.3em] text-white">
              OnRoad
            </p>
            <p className="mt-1 text-[12pt] font-light uppercase leading-none tracking-[0.3em] text-white/70">
              Books
            </p>
          </div>
          <p className="mt-4 text-[6.5pt] uppercase tracking-[0.28em] text-white/55">
            Bookkeeping built for the road
          </p>
        </div>

        <div className="flex flex-col items-end justify-between text-right">
          <p className="text-[7pt] font-medium uppercase tracking-[0.28em] text-white/60">
            {copy.financialReport}
          </p>
          <div>
            <p className="text-[21pt] font-semibold leading-none tracking-tight text-white">
              {periodLabel}
            </p>
            <p className="mt-1.5 text-[7.5pt] text-white/60">{rangeLabel}</p>
          </div>
        </div>
      </div>
      <div className="h-[3px] w-full bg-[#C8891B]" />

      <div className="mt-3 flex items-baseline justify-between gap-8">
        <p className="text-[11pt] font-semibold tracking-tight text-[#0F1E38]">
          {businessName} <span className="font-normal text-neutral-400">·</span>{" "}
          <span className="font-normal text-neutral-600">{truckName}</span>
        </p>
        <p className="text-right text-[7.5pt] leading-snug text-neutral-500">
          {interpolate(copy.comparedAgainst, { period: comparisonLabel })}
          <br />
          {interpolate(copy.generated, { date: generatedAt })}
        </p>
      </div>

      {/* The four numbers, set as a band rather than as cards. */}
      <div className="mt-3 grid grid-cols-4 border-y-2 border-[#0F1E38]">
        <Figure label={copy.bookedRevenue} value={formatMoneyCompact(summary.bookedRevenue)} />
        <Figure label={copy.businessExpenses} value={formatMoneyCompact(summary.operatingExpenses)} />
        <Figure
          label={copy.operatingProfit}
          value={formatMoneyCompact(summary.operatingProfit)}
          accent={profitable ? "positive" : "negative"}
          note={interpolate(copy.profitMargin, { percent: formatPercent(summary.netMargin) })}
        />
        <Figure
          label={copy.profitPerMile}
          value={`${formatRateValue(summary.profitPerMile)}/mi`}
          accent={summary.profitPerMile >= 0 ? "positive" : "negative"}
          note={interpolate(copy.milesDriven, {
            miles: formatLocaleNumber(Math.round(summary.totalMiles), locale),
          })}
          last
        />
      </div>

      <p className="mt-2.5 max-w-[62ch] text-[7.5pt] leading-relaxed text-neutral-500">
        {interpolate(copy.reportMethod, { period: periodLabel })}
      </p>
    </header>
  );
}

function Figure({
  label,
  value,
  note,
  accent,
  last,
}: {
  label: string;
  value: string;
  note?: string;
  accent?: "positive" | "negative";
  last?: boolean;
}) {
  return (
    <div className={`px-3.5 py-2.5 ${last ? "" : "border-r border-neutral-200"}`}>
      <p className="text-[6.5pt] font-semibold uppercase tracking-[0.16em] text-neutral-500">
        {label}
      </p>
      <p
        className={`mt-1 text-[15pt] font-semibold leading-none tracking-tight tnum ${
          accent === "positive"
            ? "text-[#15803d]"
            : accent === "negative"
              ? "text-[#b91c1c]"
              : "text-[#0F1E38]"
        }`}
      >
        {value}
      </p>
      {note ? <p className="mt-1 text-[6.5pt] text-neutral-500 tnum">{note}</p> : null}
    </div>
  );
}

/**
 * Repeated at the foot of every printed sheet.
 *
 * `position: fixed` is how a browser repeats an element across printed pages;
 * the document reserves room for it with padding so it never lands on top of
 * the content.
 */
export function ReportRunningFooter({
  businessName,
  periodLabel,
}: {
  businessName: string;
  periodLabel: string;
}) {
  return (
    <div className="hidden print:fixed print:bottom-0 print:left-0 print:right-0 print:block">
      <div className="flex items-baseline justify-between gap-6 border-t border-neutral-300 pt-1.5 text-[6.5pt] uppercase tracking-[0.16em] text-neutral-400">
        <span>
          <span className="font-semibold text-[#0F1E38]">{APP_NAME}</span> · {businessName}
        </span>
        <span>{periodLabel}</span>
      </div>
    </div>
  );
}

/** Closing block, so the document ends deliberately rather than trailing off. */
export function ReportColophon({
  periodLabel,
  operatingExpenses,
}: {
  periodLabel: string;
  operatingExpenses: number;
}) {
  const { dictionary } = useLanguage();
  const copy = dictionary.reports;
  return (
    <footer className="hidden pt-3 print:block">
      <div className="h-[2px] w-full bg-[#0F1E38]" />
      <div className="mt-2 flex items-baseline justify-between gap-6 text-[7.5pt] text-neutral-500">
        <span>
          {interpolate(copy.endReport, {
            period: periodLabel,
            amount: formatMoney(operatingExpenses),
          })}
        </span>
        <span className="uppercase tracking-[0.2em] text-neutral-400">
          {copy.tagline}
        </span>
      </div>
    </footer>
  );
}
