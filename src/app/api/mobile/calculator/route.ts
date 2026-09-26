import { calculatorDriverPay } from "@/lib/driver-pay";
import { NextResponse, type NextRequest } from "next/server";
import { operatingLedger } from "@/lib/startup-costs";

import { getMobileSession } from "@/lib/auth/mobile";
import { div, summarizeFuel, thresholdsFromSettings } from "@/lib/calculations";
import { getRepository } from "@/lib/db";
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
import { capabilityRefusal, planAllows } from "@/lib/plans";
import { todayISO } from "@/lib/periods";
import { truckFromSearchParams } from "@/lib/period-params";
import { FINANCIAL_MODEL_VERSION } from "@/lib/finance/terminology";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What the Load Calculator should start from: this truck's numbers, not a
 * plausible average.
 *
 * Every field here is the same expression `src/app/(app)/calculator/page.tsx`
 * builds its `CalculatorDefaults` from. The phone was shipping hardcoded
 * guesses — 6.5 MPG, $3.85 diesel, $0.85/mi overhead — which produced a
 * confident verdict about somebody else's truck.
 *
 * `overheadCostPerMile` is deliberately NOT Actual Cost Per Mile: fuel, tolls,
 * dispatch and factoring are entered explicitly in the calculator, so a rate
 * that still contained them would charge them twice. That is the classic way a
 * load calculator lies.
 *
 * `basisSufficient` is the honest part, and for a long time this route got it
 * wrong in the owner's favour. It tested recorded mileage and nothing else,
 * while the page computes it as `!sharedOverheadUnallocated &&
 * costCoverageComplete && ...`. A truck with 30,000 miles on file and no
 * insurance expense recorded passed here and was refused there — so the phone
 * quoted a load against an overhead the browser would not show, and printed
 * "your real cost" over it. `cost-coverage.ts` says the rule this broke: a
 * missing group is never silently converted to $0.
 *
 * Everything below is the same expression the page builds, including the truck
 * scoping it does. That is the point: two clients, one calculation.
 */
export async function GET(request: NextRequest) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataset = await getRepository(session.businessId).getDataset();
  const { loads, settings, goals, fuelEntries, subscription, trucks } = dataset;
  // Same operating ledger as the web calculator: setup spend is not a running cost.
  const expenses = operatingLedger(loads, dataset.expenses);

  if (!planAllows(subscription, "cockpit")) {
    return NextResponse.json({ error: capabilityRefusal("cockpit") }, { status: 403 });
  }

  const today = todayISO();
  const search = Object.fromEntries(request.nextUrl.searchParams.entries());
  const selectableTrucks = orderedTrucks(activeTrucks(trucks));
  const selectedTruck =
    truckById(selectableTrucks, truckFromSearchParams(search, selectableTrucks) ?? "")
    ?? primaryTruck(selectableTrucks.length ? selectableTrucks : trucks);

  const scopedLoads = loadsForTruck(loads, selectedTruck.id);
  const truckExpenses = expensesForTruck(expenses, selectedTruck.id);
  // A one-truck business has only one honest destination for shared overhead.
  // A Fleet does not: allocating its office/accounting costs requires an
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
  const sharedOverheadUnallocated = hasSharedFleetOverhead && !allocateSharedOverheadByMiles;
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

  const hasActiveFinancing = (selectedTruck.monthlyPayment ?? 0) > 0
    || dataset.financialObligations.some(
      (obligation) => obligation.truckId === selectedTruck.id && obligation.active,
    );
  const debtServiceRecorded = truckMileageBasisSufficient && basis.debtServiceTotal > 0;
  const noFinancingConfirmed =
    selectedTruck.financingConfirmedNone === true && !hasActiveFinancing;
  // The web's cash basis: recorded debt OR an owner who said there is none.
  // Gating on recorded debt alone told an owner who paid his truck off that he
  // needed "more debt history", which is the wrong reason and unfixable.
  const debtServiceAvailable = truckMileageBasisSufficient
    && (debtServiceRecorded || noFinancingConfirmed);
  const fuel = summarizeFuel(scopedFuelEntries, basis.totalMiles);

  const grossRevenue = scopedLoads.reduce((total, load) => total + load.grossRate, 0);
  const dispatchPaid = scopedLoads.reduce((total, load) => total + load.dispatchFee, 0);
  const factoringPaid = scopedLoads.reduce((total, load) => total + load.factoringFee, 0);
  const latestFuel = [...scopedFuelEntries].sort((a, b) => b.date.localeCompare(a.date))[0];

  return NextResponse.json(
    {
      calculationVersion: FINANCIAL_MODEL_VERSION,
      // Null rather than a number nobody proved: the app leaves the field
      // empty and refuses to estimate instead of assuming a fleet average.
      fuelPrice: latestFuel?.pricePerGallon ?? fuel.averagePricePerGallon ?? null,
      mpg: fuel.milesPerGallon ?? null,
      dispatchPct: Math.round(div(dispatchPaid, grossRevenue) * 1000) / 10,
      factoringPct: Math.round(div(factoringPaid, grossRevenue) * 1000) / 10,
      // Web parity: the calculator counts the truck's driver (iOS seeds its
      // "Pago al chofer" field from these).
      driverPayMode: calculatorDriverPay(dataset.drivers, selectedTruck.id).mode,
      driverPayValue: calculatorDriverPay(dataset.drivers, selectedTruck.id).value,
      overheadPerMile: overheadCostPerMile(basis) + (sharedOverheadPerMile ?? 0),
      debtServicePerMile: basis.debtServicePerMile,
      trueCostPerMile: basis.trueCostPerMile + (sharedOverheadPerMile ?? 0),
      basisLabel: basis.basisLabel,
      basisMiles: basis.totalMiles,
      basisSufficient: operatingCostAvailable,
      debtServiceAvailable,
      // Why a refusal is a refusal. Without these the phone can only say
      // "more history needed", which is often not the reason.
      costCoverage,
      costCoverageComplete,
      sharedOverheadUnallocated,
      sharedOverheadPerMile: sharedOverheadPerMile ?? 0,
      debtServiceRecorded,
      noFinancingConfirmed,
      truckName: selectedTruck.name,
      targetProfitPerMile: goals.targetProfitPerMile,
      deadheadWarnPct: settings.deadheadWarnPct,
      thresholds: thresholdsFromSettings(settings),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
