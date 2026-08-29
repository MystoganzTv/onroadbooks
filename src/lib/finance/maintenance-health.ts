/**
 * MAINTENANCE HEALTH
 * ==================
 *
 * Two questions on one panel:
 *
 *   1. What is due?             -> the existing due/overdue engine.
 *   2. Can I afford it?         -> upcoming estimated cost against the
 *                                  maintenance reserve balance.
 *
 * The cost estimate is the truck's OWN history: the last thing an oil change
 * cost on this truck is a better estimate than any published average. When a
 * service type has never been logged with a cost, it contributes nothing to
 * the estimate and is reported as unpriced rather than guessed at.
 */

import { div, roundMoney } from "../calculations";
import { maintenanceLabel, type DueThresholds, upcomingMaintenance } from "../maintenance";
import type { MaintenanceDue, MaintenanceRecord, Truck } from "../types";

export interface UpcomingService {
  due: MaintenanceDue;
  /** Most recent cost recorded for this service type, or null if never priced. */
  estimatedCost: number | null;
  label: string;
}

export interface MaintenanceHealth {
  items: MaintenanceDue[];
  /** Overdue and due-soon items only -- what the reserve has to cover next. */
  upcoming: UpcomingService[];
  upcomingCost: number;
  unpricedCount: number;
  reserveBalance: number;
  /**
   * How many times over the reserve covers what is coming. Null when nothing
   * is due or nothing has ever been priced -- a coverage ratio with no cost
   * behind it would be a made-up number.
   */
  coverage: number | null;
  overdueCount: number;
  dueSoonCount: number;
}

export function calculateMaintenanceHealth(
  records: MaintenanceRecord[],
  truck: Truck,
  today: string,
  thresholds: DueThresholds,
  reserveBalance: number,
): MaintenanceHealth {
  const items = upcomingMaintenance(records, truck, today, thresholds);

  const lastCostByType = new Map<string, number>();
  for (const record of [...records].sort((a, b) => a.serviceDate.localeCompare(b.serviceDate))) {
    if (record.cost > 0) lastCostByType.set(record.type, record.cost);
  }

  const upcoming: UpcomingService[] = items
    .filter((item) => item.status === "OVERDUE" || item.status === "DUE_SOON")
    .map((due) => ({
      due,
      estimatedCost: lastCostByType.get(due.type) ?? null,
      label: maintenanceLabel(due.type),
    }));

  const upcomingCost = roundMoney(
    upcoming.reduce((total, item) => total + (item.estimatedCost ?? 0), 0),
  );

  return {
    items,
    upcoming,
    upcomingCost,
    unpricedCount: upcoming.filter((item) => item.estimatedCost === null).length,
    reserveBalance: roundMoney(reserveBalance),
    coverage: upcomingCost > 0 ? div(reserveBalance, upcomingCost) : null,
    overdueCount: items.filter((i) => i.status === "OVERDUE").length,
    dueSoonCount: items.filter((i) => i.status === "DUE_SOON").length,
  };
}
