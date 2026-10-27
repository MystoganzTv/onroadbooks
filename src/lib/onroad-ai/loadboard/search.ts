/**
 * LOAD DISCOVERY -- search, price, rank
 * =====================================
 *
 * 1. read the driver's profile
 * 2. ask an AVAILABLE provider (authorized data only)
 * 3. drop loads the truck cannot take (equipment, weight, length, liftgate)
 * 4. price every candidate through the same `analyzeLoad` as a typed load
 * 5. rank by contribution, then score, then real RPM
 *
 * Nothing is invented: a board load without a posted rate is listed as
 * "no rate posted" with the ASK the driver should quote, never with a
 * guessed rate.
 */

import { analyzeLoad, type FreightAnalysis } from "../analyze";
import type { SearchCriteria } from "../ai/schema";
import type { LoadEquipment } from "../load-facts";
import type { DriverProfile, TruckType } from "../profile";
import type { BoardLoad, LoadBoardProvider, LoadSearchQuery } from "./provider";

type OkAnalysis = Extract<FreightAnalysis, { status: "OK" }>;

export interface RankedLoad {
  load: BoardLoad;
  analysis: OkAnalysis;
  /** Pickup and/or delivery in the driver's preferred states. */
  preferred: boolean;
}

/** 0, 1 or 2: how many ends of the lane are in the driver's preferred states. */
export function preferenceMatch(profile: DriverProfile, load: BoardLoad): number {
  const origin = load.facts.origin?.state ?? null;
  const destination = load.facts.destination?.state ?? null;
  return (origin && profile.preferredOrigins.includes(origin) ? 1 : 0) + (destination && profile.preferredDestinations.includes(destination) ? 1 : 0);
}

/**
 * Broker names and contacts are shown only where the provider's licence
 * allows it. Applied before a load reaches the router, so a licence-limited
 * provider's broker data cannot leak through a broker message either.
 */
export function withLicensedBrokerFields(load: BoardLoad): BoardLoad {
  if (load.brokerDisplayAllowed) return load;
  return {
    ...load,
    facts: { ...load.facts, brokerCompany: null, brokerContact: null, brokerMc: null, brokerPhone: null, brokerEmail: null },
  };
}

export type SearchOutcome =
  | { kind: "UNAVAILABLE" }
  | { kind: "RESULTS"; provider: { id: string; label: string; isMock: boolean }; ranked: RankedLoad[]; consideredCount: number };

/** The equipment a truck may search for. Never "anything with wheels". */
const SEARCHABLE: Record<TruckType, LoadEquipment[]> = {
  BOX_TRUCK: ["BOX_TRUCK", "CARGO_VAN"],
  REEFER_BOX: ["REEFER_BOX", "BOX_TRUCK", "CARGO_VAN"],
  CARGO_VAN: ["CARGO_VAN"],
  HOTSHOT: ["HOTSHOT", "FLATBED"],
  DRY_VAN: ["DRY_VAN"],
  REEFER: ["REEFER", "DRY_VAN"],
  FLATBED: ["FLATBED"],
  OTHER: [],
};

export function buildQuery(profile: DriverProfile, criteria: SearchCriteria | null): LoadSearchQuery {
  return {
    near: criteria?.nearCity || criteria?.nearState ? { city: criteria?.nearCity ?? null, state: criteria?.nearState ?? null } : null,
    radiusMiles: criteria?.radiusMiles ?? profile.maxDeadheadMiles,
    towardState: criteria?.towardState ?? null,
    pickupDate: criteria?.pickupDate ?? null,
    equipment: profile.truckType ? SEARCHABLE[profile.truckType] : [],
    maxDeadheadMiles: criteria?.radiusMiles ?? profile.maxDeadheadMiles,
    limit: 25,
  };
}

export function rankLoads(profile: DriverProfile, loads: BoardLoad[], minRatePerTotalMile: number | null): RankedLoad[] {
  const ranked: RankedLoad[] = [];
  for (const raw of loads) {
    const load = withLicensedBrokerFields(raw);
    const analysis = analyzeLoad(profile, load.facts, { needOffer: false });
    if (analysis.status !== "OK") continue;
    if (analysis.compatibility.status === "INCOMPATIBLE") continue;
    // A minimum rate cannot be checked on a load with no rate posted, so it is not a match.
    if (minRatePerTotalMile !== null && (!analysis.hasOffer || analysis.estimate.grossPerTotalMile < minRatePerTotalMile)) continue;
    ranked.push({ load, analysis, preferred: preferenceMatch(profile, load) > 0 });
  }
  // Preferred lanes first (the driver said where they want to go), then money.
  return ranked.sort((a, b) => {
    const ea = a.analysis.estimate;
    const eb = b.analysis.estimate;
    const pa = preferenceMatch(profile, a.load);
    const pb = preferenceMatch(profile, b.load);
    if (pa !== pb) return pb - pa;
    if (a.analysis.hasOffer !== b.analysis.hasOffer) return a.analysis.hasOffer ? -1 : 1;
    return (
      eb.contributionProfit - ea.contributionProfit ||
      eb.score.score - ea.score.score ||
      eb.grossPerTotalMile - ea.grossPerTotalMile
    );
  });
}

export async function searchLoads(
  providers: LoadBoardProvider[],
  profile: DriverProfile,
  criteria: SearchCriteria | null,
): Promise<SearchOutcome> {
  const provider = providers.find((item) => item.status().available);
  if (!provider) return { kind: "UNAVAILABLE" };
  const loads = await provider.searchLoads(buildQuery(profile, criteria));
  const ranked = rankLoads(profile, loads, criteria?.minRatePerTotalMile ?? null).slice(0, 5);
  return { kind: "RESULTS", provider: { id: provider.id, label: provider.label, isMock: provider.isMock }, ranked, consideredCount: loads.length };
}
