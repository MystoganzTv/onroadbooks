import type { Load } from "./types";

export interface DriverScheduleEntry {
  loadId: string;
  driverId: string;
  truckId: string;
  pickupDate: string;
  deliveryDate: string | null;
  loadNumber: string | null;
  originCity: string;
  originState: string;
  destinationCity: string;
  destinationState: string;
}

export interface DriverScheduleCandidate {
  loadId?: string | null;
  driverId: string | null;
  pickupDate: string;
  deliveryDate: string | null;
}

/** A compact, serializable schedule safe to pass into the load form. */
export function driverScheduleFromLoads(
  loads: Pick<
    Load,
    | "id"
    | "driverId"
    | "truckId"
    | "date"
    | "deliveryDate"
    | "loadNumber"
    | "originCity"
    | "originState"
    | "destinationCity"
    | "destinationState"
  >[],
): DriverScheduleEntry[] {
  return loads.flatMap((load) =>
    load.driverId
      ? [
          {
            loadId: load.id,
            driverId: load.driverId,
            truckId: load.truckId,
            pickupDate: load.date,
            deliveryDate: load.deliveryDate,
            loadNumber: load.loadNumber,
            originCity: load.originCity,
            originState: load.originState,
            destinationCity: load.destinationCity,
            destinationState: load.destinationState,
          },
        ]
      : [],
  );
}

/**
 * Finds assignments whose inclusive pickup-delivery windows intersect.
 * A missing delivery date means a one-day assignment. Date-only records can
 * prove a possible conflict, not an hourly collision, so callers warn rather
 * than blocking the load.
 */
export function findDriverScheduleConflicts(
  schedule: DriverScheduleEntry[],
  candidate: DriverScheduleCandidate,
): DriverScheduleEntry[] {
  if (!candidate.driverId || !candidate.pickupDate) return [];

  const candidateEnd = candidate.deliveryDate || candidate.pickupDate;
  if (candidateEnd < candidate.pickupDate) return [];

  return schedule
    .filter((entry) => {
      if (entry.driverId !== candidate.driverId || entry.loadId === candidate.loadId) {
        return false;
      }
      const entryEnd = entry.deliveryDate || entry.pickupDate;
      return entry.pickupDate <= candidateEnd && candidate.pickupDate <= entryEnd;
    })
    .sort(
      (a, b) =>
        a.pickupDate.localeCompare(b.pickupDate) ||
        (a.deliveryDate ?? a.pickupDate).localeCompare(b.deliveryDate ?? b.pickupDate) ||
        a.loadId.localeCompare(b.loadId),
    );
}
