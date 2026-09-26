import type { Metadata } from "next";

import { CalculatorPanel, type CalculatorDefaults } from "@/components/calculator/calculator-panel";
import { TruckSwitcher } from "@/components/fleet/truck-switcher";
import { PageHeader } from "@/components/shared/page-header";
import { PlanGate } from "@/components/shared/plan-gate";
import { requireSession } from "@/lib/auth";
import { getDataset } from "@/lib/db";
import {
  activeTrucks,
  loadsForTruck,
  orderedTrucks,
  primaryTruck,
  truckById,
} from "@/lib/fleet";
import { calculatorDefaults } from "@/lib/finance/calculator-defaults";
import { todayISO } from "@/lib/periods";
import { planAllows } from "@/lib/plans";
import { getWebDictionary } from "@/lib/i18n/dictionaries";
import { getAppLocale } from "@/lib/i18n-server";
import { param, type SearchParams } from "@/lib/period-params";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAppLocale();
  return { title: getWebDictionary(locale).calculator.metadataTitle };
}

/**
 * The calculator runs on the truck's OWN history, not on averages:
 *
 *   MPG          a reference entered by the user; purchases and odometer
 *                readings cannot establish fuel consumption.
 *   Fuel price   the most recent price actually paid.
 *   Fees         the dispatch and factoring rates this truck has been paying,
 *                inferred from the ledger against Booked Revenue.
 *   Business expenses are shown for the current month, without allocation.
 */
export default async function CalculatorPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [session, locale, params] = await Promise.all([
    requireSession(),
    getAppLocale(),
    searchParams,
  ]);
  const copy = getWebDictionary(locale).calculator;
  const dataset = await getDataset(session.businessId);
  const { trucks, loads } = dataset;

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
  const selectableTrucks = orderedTrucks(activeTrucks(trucks));
  const selectedTruck = truckById(selectableTrucks, param(params, "truck"))
    ?? primaryTruck(selectableTrucks.length ? selectableTrucks : trucks);
  const scopedLoads = loadsForTruck(loads, selectedTruck.id);
  const shared = calculatorDefaults(dataset, selectedTruck, today);
  const defaults: CalculatorDefaults = {
    ...shared,
    fuelPrice: shared.fuelPrice ?? 0,
    mpg: shared.mpg ?? 0,
    brokers: [...new Set(scopedLoads.map((l) => l.broker).filter(Boolean))].sort() as string[],
    trucks,
    defaultTruckId: selectedTruck.id,
    defaultDate: today,
  };

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
      />
      <TruckSwitcher
        trucks={selectableTrucks}
        selectedId={selectedTruck.id}
        includeAll={false}
      />
      <CalculatorPanel key={selectedTruck.id} defaults={defaults} />
    </div>
  );
}
