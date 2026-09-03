import type { Metadata } from "next";

import { CalculatorPanel, type CalculatorDefaults } from "@/components/calculator/calculator-panel";
import { TruckSwitcher } from "@/components/fleet/truck-switcher";
import { PageHeader } from "@/components/shared/page-header";
import { PlanGate } from "@/components/shared/plan-gate";
import { requireSession } from "@/lib/auth";
import { div, summarizeFuel, thresholdsFromSettings } from "@/lib/calculations";
import { getDataset } from "@/lib/db";
import {
  activeTrucks,
  expensesForTruck,
  loadsForTruck,
  orderedTrucks,
  overheadExpenses,
  primaryTruck,
  truckById,
} from "@/lib/fleet";
import {
  hasSufficientOperatingCostBasis,
  hasUnallocatedSharedOperatingCosts,
  MIN_BASIS_MILES,
  overheadCostPerMile,
  sharedOperatingCostPerFleetMile,
  trailingCostBasis,
} from "@/lib/finance/cost-per-mile";
import {
  hasCompleteOperatingCostCoverage,
  operatingCostCoverage,
} from "@/lib/finance/cost-coverage";
import { todayISO } from "@/lib/periods";
import { planAllows } from "@/lib/plans";
import { getWebDictionary } from "@/lib/i18n/dictionaries";
import { getAppLocale } from "@/lib/i18n-server";
import { param, type SearchParams } from "@/lib/period-params";
import { roleCan } from "@/lib/roles";

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
  const selectableTrucks = orderedTrucks(activeTrucks(trucks));
  const selectedTruck = truckById(selectableTrucks, param(params, "truck"))
    ?? primaryTruck(selectableTrucks.length ? selectableTrucks : trucks);
  const scopedLoads = loadsForTruck(loads, selectedTruck.id);
  const truckExpenses = expensesForTruck(expenses, selectedTruck.id);
  // A one-truck business has only one honest destination for shared overhead.
  // A Fleet does not: allocating its office/accounting/etc. costs requires an
  // explicit policy, so those rows stay out of the unit basis until one exists.
  const scopedExpenses = selectableTrucks.length > 1
    ? truckExpenses
    : [...truckExpenses, ...overheadExpenses(expenses)];
  const scopedFuelEntries = fuelEntries.filter((entry) => entry.truckId === selectedTruck.id);

  const basis = trailingCostBasis(scopedLoads, scopedExpenses, settings, today);
  const truckMileageBasisSufficient = basis.sufficient && basis.totalMiles >= MIN_BASIS_MILES;
  const truckOperatingBasisSufficient = hasSufficientOperatingCostBasis(basis);
  const hasSharedFleetOverhead = selectableTrucks.length > 1
    && truckMileageBasisSufficient
    && hasUnallocatedSharedOperatingCosts(expenses, basis, today);
  const allocateSharedOverheadByMiles = hasSharedFleetOverhead
    && settings.fleetOverheadAllocation === "FLEET_MILES";
  const sharedOverheadPerMile = allocateSharedOverheadByMiles
    ? sharedOperatingCostPerFleetMile(loads, expenses, basis)
    : 0;
  const sharedOverheadUnallocated = hasSharedFleetOverhead
    && !allocateSharedOverheadByMiles;
  const coverageExpenses = selectableTrucks.length > 1
    && settings.fleetOverheadAllocation !== "FLEET_MILES"
    ? truckExpenses
    : [...truckExpenses, ...overheadExpenses(expenses)];
  const costCoverage = operatingCostCoverage(
    coverageExpenses,
    basis,
    selectedTruck.operatingCostExemptions,
  );
  const costCoverageComplete = hasCompleteOperatingCostCoverage(costCoverage);
  const operatingCostAvailable = !sharedOverheadUnallocated
    && costCoverageComplete
    && (truckOperatingBasisSufficient || (sharedOverheadPerMile ?? 0) > 0);
  const debtServiceRecorded = basis.sufficient
    && basis.totalMiles >= MIN_BASIS_MILES
    && basis.debtServiceTotal > 0;
  const fuel = summarizeFuel(scopedFuelEntries, basis.totalMiles);

  const grossRevenue = scopedLoads.reduce((total, load) => total + load.grossRate, 0);
  const dispatchPaid = scopedLoads.reduce((total, load) => total + load.dispatchFee, 0);
  const factoringPaid = scopedLoads.reduce((total, load) => total + load.factoringFee, 0);

  const latestFuel = [...scopedFuelEntries].sort((a, b) => b.date.localeCompare(a.date))[0];
  const hasActiveFinancing = (selectedTruck.monthlyPayment ?? 0) > 0
    || dataset.financialObligations.some(
      (obligation) => obligation.truckId === selectedTruck.id && obligation.active,
    );

  const defaults: CalculatorDefaults = {
    fuelPrice: latestFuel?.pricePerGallon ?? fuel.averagePricePerGallon ?? 0,
    mpg: fuel.milesPerGallon ?? 0,
    dispatchPct: Math.round(div(dispatchPaid, grossRevenue) * 1000) / 10,
    factoringPct: Math.round(div(factoringPaid, grossRevenue) * 1000) / 10,
    overheadPerMile: overheadCostPerMile(basis) + (sharedOverheadPerMile ?? 0),
    debtServicePerMile: basis.debtServicePerMile,
    trueCostPerMile: basis.trueCostPerMile + (sharedOverheadPerMile ?? 0),
    basisLabel: basis.basisLabel,
    basisMiles: basis.totalMiles,
    basisSufficient: operatingCostAvailable,
    sharedOverheadUnallocated,
    sharedOverheadPerMile: sharedOverheadPerMile ?? 0,
    costCoverage,
    costCoverageComplete,
    debtServiceRecorded,
    noFinancingConfirmed:
      selectedTruck.financingConfirmedNone === true && !hasActiveFinancing,
    canManageFinancing:
      roleCan(session.role ?? "VIEWER", "manage_owner_finances") && !hasActiveFinancing,
    canManageCostProfile: roleCan(session.role ?? "VIEWER", "manage_owner_finances"),
    targetProfitPerMile: goals.targetProfitPerMile,
    deadheadWarnPct: settings.deadheadWarnPct,
    thresholds: thresholdsFromSettings(settings),
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
