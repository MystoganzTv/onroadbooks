/**
 * LOAD BOARD PROVIDERS
 * ====================
 *
 * The bot never scrapes a load board, never drives a browser against one
 * and never uses shared credentials. Live search goes through a provider
 * that holds an AUTHORIZED API connection; until one exists the bot says
 * plainly that live search is unavailable and keeps pricing the loads
 * drivers send it themselves.
 *
 * Distances from a provider are labelled: a board's "DH-O" is the board's
 * estimate, not a confirmed route, and the reply says so.
 */

import type { LoadEquipment, LoadFacts, Place } from "../load-facts";

export interface LoadSearchQuery {
  near: Place | null;
  radiusMiles: number | null;
  towardState: string | null;
  pickupDate: string | null;
  equipment: LoadEquipment[];
  maxDeadheadMiles: number | null;
  limit: number;
}

export type DistanceBasis = "PROVIDER_ESTIMATE" | "ROUTED" | "STATED";

export interface BoardLoad {
  providerId: string;
  providerLoadId: string;
  facts: LoadFacts;
  /** How deadhead and loaded miles were obtained. Never shown as confirmed unless ROUTED. */
  distanceBasis: DistanceBasis;
  postedAt: string | null;
  /** Whether the provider's licence lets us show the broker's details to this user. */
  brokerDisplayAllowed: boolean;
}

export type ProviderStatus =
  | { available: true }
  | { available: false; reason: "NOT_CONFIGURED" | "NOT_AUTHORIZED" | "NOT_IMPLEMENTED" | "DISABLED_IN_PRODUCTION" };

export interface LoadBoardProvider {
  readonly id: string;
  readonly label: string;
  /** Test data. Every reply built from it carries a TEST DATA banner. */
  readonly isMock: boolean;
  status(): ProviderStatus;
  searchLoads(query: LoadSearchQuery): Promise<BoardLoad[]>;
  getLoadDetails(providerLoadId: string): Promise<BoardLoad | null>;
}

export class LoadBoardUnavailableError extends Error {
  constructor(readonly providerId: string, readonly reason: string) {
    super(`${providerId} load search is unavailable (${reason}).`);
  }
}

/* -- Pure filters, shared by every provider and by ranking ---------------- */

export function filterByEquipment(loads: BoardLoad[], equipment: LoadEquipment[]): BoardLoad[] {
  if (!equipment.length) return loads;
  return loads.filter((load) => load.facts.equipment !== null && equipment.includes(load.facts.equipment));
}

export function filterByLocation(loads: BoardLoad[], near: Place | null, towardState: string | null): BoardLoad[] {
  return loads.filter((load) => {
    if (near?.state && load.facts.origin?.state !== near.state) return false;
    if (towardState && load.facts.destination?.state !== towardState) return false;
    return true;
  });
}

export function filterByDeadhead(loads: BoardLoad[], maxDeadheadMiles: number | null): BoardLoad[] {
  if (maxDeadheadMiles === null) return loads;
  return loads.filter((load) => load.facts.deadheadPickupMiles !== null && load.facts.deadheadPickupMiles <= maxDeadheadMiles);
}

export function filterByPickupDate(loads: BoardLoad[], pickupDate: string | null): BoardLoad[] {
  if (!pickupDate) return loads;
  return loads.filter((load) => load.facts.pickupDate === pickupDate);
}
