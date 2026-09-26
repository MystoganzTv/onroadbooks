import { roundMoney } from "./calculations";
import { calculateDriverPay } from "./driver-pay";
import { MIN_BASIS_MILES, trailingCostBasis } from "./finance/cost-per-mile";
import { fuelRate, recentFuelPrice, type FuelRate } from "./fuel-estimate";
import { expensesForTruck, loadsForTruck } from "./fleet";
import { operatingLedger } from "./startup-costs";
import type { Dataset, Load } from "./types";

/**
 * What a load costs before its bills are all in. Two costs are known the day
 * a load is booked but only reach the ledger later, so without an estimate a
 * load looks better than it was:
 *
 *  - Fuel. Purchases are recorded against the truck, never the trip (a fill-up
 *    feeds several loads). The trip's share is its total miles at the truck's
 *    fuel rate (`fuel-estimate.ts`): the owner's reference MPG x the price
 *    this truck last paid, or, without an MPG, fuel dollars per mile from the
 *    ledger once the truck has MIN_BASIS_MILES of history. No MPG is invented.
 *  - Driver pay. The driver's terms (e.g. 33 % of gross) price it exactly;
 *    it is posted when the driver's settlement is paid. Until then the
 *    expected amount stands in, and a draft settlement's line wins over the
 *    terms because that is the number the owner is about to pay.
 *
 * An amount recorded on the load always wins, and nothing here is written to
 * the ledger: Expenses keeps the real fuel receipts and the paid settlement.
 */
export interface TripCostEstimate {
  fuelCost?: number;
  /** Fuel dollars per mile the estimate used. */
  fuelPerMile?: number;
  /** How that rate was reached, so the screen can show the arithmetic. */
  fuelSource?: FuelRate["source"];
  fuelMpg?: number;
  fuelPricePerGallon?: number;
  driverPay?: number;
}

export type LoadCostEstimator = (load: Load) => TripCostEstimate;

type EstimateSource = Pick<
  Dataset,
  "loads" | "expenses" | "settings" | "drivers" | "driverSettlements"
> & Partial<Pick<Dataset, "trucks" | "fuelEntries">>;

export interface TruckFuelBasis {
  /** The rate a load on this truck is estimated at, or null when unknown. */
  rate: FuelRate | null;
  /** Fuel dollars per mile measured from the ledger, or null when too thin. */
  ledgerPerMile: number | null;
  /** The miles behind that measurement. */
  ledgerMiles: number;
}

/** One truck's fuel rate and the ledger measurement it can be checked against. */
export function truckFuelBasis(dataset: EstimateSource, truckId: string, today: string): TruckFuelBasis {
  const basis = trailingCostBasis(
    loadsForTruck(dataset.loads, truckId),
    expensesForTruck(operatingLedger(dataset.loads, dataset.expenses), truckId),
    dataset.settings,
    today,
  );
  const fuel = basis.lines.find((line) => line.category === "FUEL")?.amount ?? 0;
  const ledgerPerMile = basis.sufficient && basis.totalMiles >= MIN_BASIS_MILES && fuel > 0
    ? fuel / basis.totalMiles
    : null;
  const truck = dataset.trucks?.find((row) => row.id === truckId);
  return {
    rate: fuelRate({
      referenceMpg: truck?.referenceMpg ?? null,
      price: recentFuelPrice(dataset.fuelEntries ?? [], truckId, today),
      ledgerPerMile,
    }),
    ledgerPerMile,
    ledgerMiles: basis.totalMiles,
  };
}

export function buildLoadEstimator(dataset: EstimateSource, today: string): LoadCostEstimator {
  const rateByTruck = new Map<string, FuelRate | null>();
  const fuelRateFor = (truckId: string): FuelRate | null => {
    if (!rateByTruck.has(truckId)) rateByTruck.set(truckId, truckFuelBasis(dataset, truckId, today).rate);
    return rateByTruck.get(truckId)!;
  };

  const settlementLine = new Map<string, { payAmount: number; paid: boolean }>();
  for (const settlement of dataset.driverSettlements ?? []) {
    for (const line of settlement.lines) {
      settlementLine.set(line.loadId, {
        payAmount: line.payAmount,
        paid: settlement.status === "PAID",
      });
    }
  }
  const drivers = new Map((dataset.drivers ?? []).map((driver) => [driver.id, driver]));

  return (load) => {
    const estimate: TripCostEstimate = {};

    if (!(load.fuelCost > 0)) {
      const rate = fuelRateFor(load.truckId);
      const miles = (load.loadedMiles ?? 0) + (load.deadheadMiles ?? 0);
      if (rate !== null && miles > 0) {
        estimate.fuelCost = roundMoney(miles * rate.perMile);
        estimate.fuelPerMile = Math.round(rate.perMile * 1000) / 1000;
        estimate.fuelSource = rate.source;
        if (rate.source === "MPG" && rate.mpg && rate.price) {
          estimate.fuelMpg = rate.mpg;
          estimate.fuelPricePerGallon = Math.round(rate.price.pricePerGallon * 1000) / 1000;
        }
      }
    }

    if (!(load.driverPay > 0) && load.driverId) {
      const line = settlementLine.get(load.id);
      if (line) {
        // A paid statement already set the load's pay; zero there is real.
        if (!line.paid && line.payAmount > 0) estimate.driverPay = roundMoney(line.payAmount);
      } else {
        const driver = drivers.get(load.driverId);
        if (driver && driver.payRate > 0) {
          const pay = calculateDriverPay(driver.payType, driver.payRate, load);
          if (pay > 0) estimate.driverPay = pay;
        }
      }
    }

    return estimate;
  };
}
