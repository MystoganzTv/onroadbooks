import type { Metadata } from "next";

import { CalculatorPanel, type CalculatorDefaults } from "@/components/calculator/calculator-panel";
import { PageHeader } from "@/components/shared/page-header";
import { requireSession } from "@/lib/auth";
import { div, summarizeFuel, thresholdsFromSettings } from "@/lib/calculations";
import { getRepository } from "@/lib/db";
import { overheadCostPerMile, trailingCostBasis } from "@/lib/finance/cost-per-mile";
import { todayISO } from "@/lib/periods";

export const metadata: Metadata = { title: "Load Calculator" };

/**
 * The calculator runs on the truck's OWN history, not on averages:
 *
 *   MPG          derived from odometer readings across fuel fill-ups, so it is
 *                this truck loaded the way this owner loads it.
 *   Fuel price   the most recent price actually paid.
 *   Fees         the dispatch and factoring rates this truck has been paying,
 *                inferred from the ledger against gross revenue.
 *   Overhead     trailing-90-day true cost per mile with fuel, tolls, dispatch
 *                and factoring removed, because those are entered per load.
 */
export default async function CalculatorPage() {
  const session = await requireSession();
  const dataset = await getRepository(session.businessId).getDataset();
  const { trucks, loads, expenses, fuelEntries, settings, goals } = dataset;
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
        title="Load Calculator"
        description="Price a load before you say yes, or work out what to quote the broker."
      />
      <CalculatorPanel defaults={defaults} />
    </div>
  );
}
