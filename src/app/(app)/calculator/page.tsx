import type { Metadata } from "next";

import { CalculatorPanel, type CalculatorDefaults } from "@/components/calculator/calculator-panel";
import { PageHeader } from "@/components/shared/page-header";
import { PlanGate } from "@/components/shared/plan-gate";
import { requireSession } from "@/lib/auth";
import { div, summarizeFuel, thresholdsFromSettings } from "@/lib/calculations";
import { getRepository } from "@/lib/db";
import { overheadCostPerMile, trailingCostBasis } from "@/lib/finance/cost-per-mile";
import { todayISO } from "@/lib/periods";
import { planAllows } from "@/lib/plans";
import { getWebDictionary } from "@/lib/i18n/dictionaries";
import { getAppLocale } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).calculator.metadataTitle };
}

/**
 * The calculator runs on the truck's OWN history, not on averages:
 *
 *   MPG          derived from odometer readings across fuel fill-ups, so it is
 *                this truck loaded the way this owner loads it.
 *   Fuel price   the most recent price actually paid.
 *   Fees         the dispatch and factoring rates this truck has been paying,
 *                inferred from the ledger against Booked Revenue.
 *   Operating    trailing-90-day actual cost per mile with fuel, tolls, dispatch
 *                and factoring removed, because those are entered per load.
 *   Debt burden  trailing debt service per mile, shown separately and never
 *                used to classify the load.
 */
export default async function CalculatorPage() {
  const [session, locale] = await Promise.all([requireSession(), getAppLocale()]);
  const copy = getWebDictionary(locale).calculator;
  const dataset = await getRepository(session.businessId).getDataset();
  const { trucks, loads, expenses, fuelEntries, settings, goals } = dataset;

  if (!planAllows(dataset.subscription, "cockpit")) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <PageHeader
          title={copy.title}
          description={copy.description}
        />
        <PlanGate
          capability="cockpit"
          what={copy.gateWhat}
        />
      </div>
    );
  }
  const today = todayISO();

  const basis = trailingCostBasis(loads, expenses, settings, today);
  const fuel = summarizeFuel(fuelEntries, basis.totalMiles);

  const grossRevenue = loads.reduce((total, load) => total + load.grossRate, 0);
  const dispatchPaid = loads.reduce((total, load) => total + load.dispatchFee, 0);
  const factoringPaid = loads.reduce((total, load) => total + load.factoringFee, 0);

  const latestFuel = [...fuelEntries].sort((a, b) => b.date.localeCompare(a.date))[0];

  const defaults: CalculatorDefaults = {
    fuelPrice: latestFuel?.pricePerGallon ?? fuel.averagePricePerGallon ?? 0,
    mpg: fuel.milesPerGallon ?? 0,
    dispatchPct: Math.round(div(dispatchPaid, grossRevenue) * 1000) / 10,
    factoringPct: Math.round(div(factoringPaid, grossRevenue) * 1000) / 10,
    overheadPerMile: overheadCostPerMile(basis),
    debtServicePerMile: basis.debtServicePerMile,
    trueCostPerMile: basis.trueCostPerMile,
    basisLabel: basis.basisLabel,
    basisMiles: basis.totalMiles,
    basisSufficient: basis.sufficient,
    targetProfitPerMile: goals.targetProfitPerMile,
    deadheadWarnPct: settings.deadheadWarnPct,
    thresholds: thresholdsFromSettings(settings),
    brokers: [...new Set(loads.map((l) => l.broker).filter(Boolean))].sort() as string[],
    trucks,
    defaultDate: today,
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
      />
      <CalculatorPanel defaults={defaults} />
    </div>
  );
}
