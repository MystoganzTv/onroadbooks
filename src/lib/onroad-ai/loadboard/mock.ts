/**
 * MOCK LOAD BOARD -- TEST DATA, NOT REAL LOADS
 * ============================================
 *
 * A fixed set of invented loads for development and tests. It exists so the
 * search -> filter -> price -> rank path can be exercised without any load
 * board account. It refuses to run in production, and every reply built on
 * it is prefixed with a "TEST DATA" banner by the router.
 *
 * Broker names are obviously fictional on purpose.
 */

import { loadFactsSchema, type LoadFacts } from "../load-facts";
import {
  filterByDeadhead,
  filterByEquipment,
  filterByLocation,
  filterByPickupDate,
  type BoardLoad,
  type LoadBoardProvider,
  type LoadSearchQuery,
  type ProviderStatus,
} from "./provider";

function load(id: string, facts: Partial<LoadFacts>): BoardLoad {
  return {
    providerId: "mock",
    providerLoadId: id,
    facts: loadFactsSchema.parse({ ...facts, brokerCompany: "TEST Freight Co (fictional)", source: "TEXT" }),
    distanceBasis: "PROVIDER_ESTIMATE",
    postedAt: null,
    brokerDisplayAllowed: true,
  };
}

export const MOCK_LOADS: BoardLoad[] = [
  load("mock-1", { origin: { city: "Chicago", state: "IL" }, destination: { city: "Richmond", state: "VA" }, loadedMiles: 820, deadheadPickupMiles: 35, grossRate: 2_050, equipment: "BOX_TRUCK", weightLbs: 6_000, pickupDate: "2026-11-02" }),
  load("mock-2", { origin: { city: "Joliet", state: "IL" }, destination: { city: "Atlanta", state: "GA" }, loadedMiles: 715, deadheadPickupMiles: 48, grossRate: 1_450, equipment: "BOX_TRUCK", weightLbs: 9_500, pickupDate: "2026-11-02" }),
  load("mock-3", { origin: { city: "Gary", state: "IN" }, destination: { city: "Columbus", state: "OH" }, loadedMiles: 330, deadheadPickupMiles: 30, grossRate: 900, equipment: "BOX_TRUCK", weightLbs: 4_000, liftgateRequired: true, pickupDate: "2026-11-03" }),
  load("mock-4", { origin: { city: "Chicago", state: "IL" }, destination: { city: "Dallas", state: "TX" }, loadedMiles: 970, deadheadPickupMiles: 12, grossRate: 2_600, equipment: "DRY_VAN", equipmentLengthFt: 53, weightLbs: 38_000, pickupDate: "2026-11-02" }),
  load("mock-5", { origin: { city: "Aurora", state: "IL" }, destination: { city: "Norfolk", state: "VA" }, loadedMiles: 900, deadheadPickupMiles: 140, grossRate: 2_300, equipment: "BOX_TRUCK", weightLbs: 7_200, pickupDate: "2026-11-04" }),
  load("mock-6", { origin: { city: "Chicago", state: "IL" }, destination: { city: "Minneapolis", state: "MN" }, loadedMiles: 410, deadheadPickupMiles: 20, grossRate: 980, equipment: "CARGO_VAN", weightLbs: 1_500, pickupDate: "2026-11-02" }),
];

export class MockLoadBoardProvider implements LoadBoardProvider {
  readonly id = "mock";
  readonly label = "TEST DATA";
  readonly isMock = true;

  constructor(private readonly options: { enabled: boolean; production: boolean }) {}

  status(): ProviderStatus {
    if (this.options.production) return { available: false, reason: "DISABLED_IN_PRODUCTION" };
    return this.options.enabled ? { available: true } : { available: false, reason: "NOT_CONFIGURED" };
  }

  async searchLoads(query: LoadSearchQuery): Promise<BoardLoad[]> {
    if (!this.status().available) return [];
    let loads = filterByLocation(MOCK_LOADS, query.near, query.towardState);
    loads = filterByEquipment(loads, query.equipment);
    loads = filterByDeadhead(loads, query.maxDeadheadMiles ?? query.radiusMiles);
    loads = filterByPickupDate(loads, query.pickupDate);
    return loads.slice(0, query.limit);
  }

  async getLoadDetails(providerLoadId: string): Promise<BoardLoad | null> {
    if (!this.status().available) return null;
    return MOCK_LOADS.find((item) => item.providerLoadId === providerLoadId) ?? null;
  }
}
