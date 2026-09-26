import { div, thresholdsFromSettings } from "../calculations";
import { loadsForTruck } from "../fleet";
import { recentFuelPrice } from "../fuel-estimate";
import type { Dataset, Truck } from "../types";
import { calculatorBusinessExpenses } from "./calculator-business-expenses";

/** Shared web/iOS inputs: direct trip costs, plus monthly context with no allocation. */
export function calculatorDefaults(dataset: Dataset, truck: Truck, today: string) {
  const loads = loadsForTruck(dataset.loads, truck.id);
  const fuel = dataset.fuelEntries.filter(entry => entry.truckId === truck.id);
  const revenue = loads.reduce((sum, load) => sum + load.grossRate, 0);
  const latestFuel = [...fuel].sort((a, b) => b.date.localeCompare(a.date))[0];
  return {
    fuelPrice: recentFuelPrice(fuel, truck.id, today)?.pricePerGallon ?? latestFuel?.pricePerGallon ?? null,
    mpg: truck.referenceMpg ?? null,
    dispatchPct: Math.round(div(loads.reduce((sum, load) => sum + load.dispatchFee, 0), revenue) * 1000) / 10,
    factoringPct: Math.round(div(loads.reduce((sum, load) => sum + load.factoringFee, 0), revenue) * 1000) / 10,
    businessExpenses: calculatorBusinessExpenses(dataset.expenses, truck.id, today),
    deadheadWarnPct: dataset.settings.deadheadWarnPct,
    thresholds: thresholdsFromSettings(dataset.settings),
  };
}
