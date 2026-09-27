import { expensesForTruck, loadsForTruck } from "@/lib/fleet";
import { truckFromSearchParams } from "@/lib/period-params";
import type { Dataset } from "@/lib/types";

/** The phone sends the same truck query as the browser. Honor it before
 * calculating totals so switching trucks never silently shows the fleet. */
export function mobileScopedDataset(dataset: Dataset, search: URLSearchParams): Dataset {
  const truckId = truckFromSearchParams(Object.fromEntries(search), dataset.trucks);
  if (!truckId) return dataset;
  return {
    ...dataset,
    loads: loadsForTruck(dataset.loads, truckId),
    expenses: expensesForTruck(dataset.expenses, truckId),
    fuelEntries: dataset.fuelEntries.filter(row => row.truckId === truckId),
    maintenanceRecords: dataset.maintenanceRecords.filter(row => row.truckId === truckId),
    financialObligations: dataset.financialObligations.filter(row => row.truckId === truckId),
  };
}
