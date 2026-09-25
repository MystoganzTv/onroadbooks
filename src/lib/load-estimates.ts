import { roundMoney } from "./calculations";
import { calculateDriverPay } from "./driver-pay";
import { MIN_BASIS_MILES, trailingCostBasis } from "./finance/cost-per-mile";
import { expensesForTruck, loadsForTruck } from "./fleet";
import { operatingLedger } from "./startup-costs";
import type { Dataset, Load } from "./types";

/**
 * What a load costs before its bills are all in. Two costs are known the day
 * a load is booked but only reach the ledger later, so without an estimate a
 * load looks better than it was:
 *
 *  - Fuel. Purchases are recorded against the truck, never the trip (a fill-up
 *    feeds several loads). The trip's share is its miles times what fuel
 *    actually cost per mile on this truck recently, read from the ledger --
 *    no MPG is invented. Unknown until the truck has MIN_BASIS_MILES of
 *    history.
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
  driverPay?: number;
}

export type LoadCostEstimator = (load: Load) => TripCostEstimate;

type EstimateSource = Pick<
  Dataset,
  "loads" | "expenses" | "settings" | "drivers" | "driverSettlements"
>;

export function buildLoadEstimator(dataset: EstimateSource, today: string): LoadCostEstimator {
  const ledger = operatingLedger(dataset.loads, dataset.expenses);
  const fuelPerMileByTruck = new Map<string, number | null>();
  const fuelPerMile = (truckId: string): number | null => {
    if (fuelPerMileByTruck.has(truckId)) return fuelPerMileByTruck.get(truckId)!;
    const basis = trailingCostBasis(
      loadsForTruck(dataset.loads, truckId),
      expensesForTruck(ledger, truckId),
      dataset.settings,
      today,
    );
    const fuel = basis.lines.find((line) => line.category === "FUEL")?.amount ?? 0;
    const rate = basis.sufficient && basis.totalMiles >= MIN_BASIS_MILES && fuel > 0
      ? fuel / basis.totalMiles
      : null;
    fuelPerMileByTruck.set(truckId, rate);
    return rate;
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
      const rate = fuelPerMile(load.truckId);
      const miles = (load.loadedMiles ?? 0) + (load.deadheadMiles ?? 0);
      if (rate !== null && miles > 0) {
        estimate.fuelCost = roundMoney(miles * rate);
        estimate.fuelPerMile = Math.round(rate * 1000) / 1000;
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
