/**
 * EQUIPMENT COMPATIBILITY
 * =======================
 *
 * Straight box trucks, vans, flatbeds and hotshots are not interchangeable.
 * This module answers one question for one load: can THIS driver's truck
 * legally and physically take it, as far as the facts we have go?
 *
 *   OK            the stated requirement matches the truck
 *   UNVERIFIED    nothing contradicts it, but something is not stated
 *                 (equipment, weight, liftgate...) -- confirm with the broker
 *   INCOMPATIBLE  a stated fact rules the truck out
 *
 * Unknown is never upgraded to OK. A posting that does not say "box truck"
 * has not said the box truck is acceptable.
 */

import type { LoadEquipment, LoadFacts } from "./load-facts";
import type { DriverProfile, TruckType } from "./profile";

export type CompatibilityStatus = "OK" | "UNVERIFIED" | "INCOMPATIBLE";

export type CompatibilityIssue =
  | { kind: "EQUIPMENT_UNKNOWN" }
  | { kind: "EQUIPMENT_MISMATCH"; required: LoadEquipment; truck: TruckType }
  | { kind: "EQUIPMENT_CONFIRM"; required: LoadEquipment; truck: TruckType }
  | { kind: "TRUCK_UNKNOWN" }
  | { kind: "OVERWEIGHT"; weightLbs: number; capacityLbs: number }
  | { kind: "WEIGHT_UNKNOWN" }
  | { kind: "CAPACITY_UNKNOWN"; weightLbs: number }
  | { kind: "TOO_LONG"; requiredFt: number; truckFt: number }
  | { kind: "LIFTGATE_MISSING" }
  | { kind: "LIFTGATE_UNKNOWN" }
  | { kind: "PALLET_JACK_MISSING" }
  | { kind: "PALLET_JACK_UNKNOWN" };

export interface Compatibility {
  status: CompatibilityStatus;
  issues: CompatibilityIssue[];
}

/**
 * Exact matches, plus the few substitutions that are physically safe:
 * a reefer box can haul dry freight; a box truck can haul what was posted
 * for a cargo van (the broker still has to accept it -- UNVERIFIED).
 */
const SAME: Partial<Record<TruckType, LoadEquipment[]>> = {
  BOX_TRUCK: ["BOX_TRUCK"],
  REEFER_BOX: ["REEFER_BOX", "BOX_TRUCK"],
  CARGO_VAN: ["CARGO_VAN"],
  HOTSHOT: ["HOTSHOT"],
  DRY_VAN: ["DRY_VAN"],
  REEFER: ["REEFER", "DRY_VAN"],
  FLATBED: ["FLATBED"],
};

const CONFIRM: Partial<Record<TruckType, LoadEquipment[]>> = {
  BOX_TRUCK: ["CARGO_VAN"],
  REEFER_BOX: ["CARGO_VAN"],
  HOTSHOT: ["FLATBED"],
};

function equipmentCheck(truck: TruckType, required: LoadEquipment, facts: LoadFacts, profile: DriverProfile): CompatibilityIssue | null {
  if (required === "OTHER") return { kind: "EQUIPMENT_UNKNOWN" };
  if (SAME[truck]?.includes(required)) return null;
  if (CONFIRM[truck]?.includes(required)) return { kind: "EQUIPMENT_CONFIRM", required, truck };
  // A "dry van" posting short enough for a straight truck is common on
  // expedited boards; it is the broker's call, never ours.
  if (
    (truck === "BOX_TRUCK" || truck === "REEFER_BOX") &&
    required === "DRY_VAN" &&
    facts.equipmentLengthFt !== null &&
    profile.truckLengthFt !== null &&
    facts.equipmentLengthFt <= profile.truckLengthFt
  ) {
    return { kind: "EQUIPMENT_CONFIRM", required, truck };
  }
  return { kind: "EQUIPMENT_MISMATCH", required, truck };
}

export function checkCompatibility(facts: LoadFacts, profile: DriverProfile): Compatibility {
  const issues: CompatibilityIssue[] = [];

  if (!profile.truckType || profile.truckType === "OTHER") issues.push({ kind: "TRUCK_UNKNOWN" });
  else if (facts.equipment === null) issues.push({ kind: "EQUIPMENT_UNKNOWN" });
  else {
    const issue = equipmentCheck(profile.truckType, facts.equipment, facts, profile);
    if (issue) issues.push(issue);
  }

  if (facts.weightLbs === null) issues.push({ kind: "WEIGHT_UNKNOWN" });
  else if (profile.cargoCapacityLbs === null) issues.push({ kind: "CAPACITY_UNKNOWN", weightLbs: facts.weightLbs });
  else if (facts.weightLbs > profile.cargoCapacityLbs) {
    issues.push({ kind: "OVERWEIGHT", weightLbs: facts.weightLbs, capacityLbs: profile.cargoCapacityLbs });
  }

  if (
    facts.equipmentLengthFt !== null &&
    profile.truckLengthFt !== null &&
    facts.equipmentLengthFt > profile.truckLengthFt
  ) {
    issues.push({ kind: "TOO_LONG", requiredFt: facts.equipmentLengthFt, truckFt: profile.truckLengthFt });
  }

  if (facts.liftgateRequired === true) {
    if (profile.hasLiftgate === false) issues.push({ kind: "LIFTGATE_MISSING" });
    else if (profile.hasLiftgate === null) issues.push({ kind: "LIFTGATE_UNKNOWN" });
  }
  if (facts.palletJackRequired === true) {
    if (profile.hasPalletJack === false) issues.push({ kind: "PALLET_JACK_MISSING" });
    else if (profile.hasPalletJack === null) issues.push({ kind: "PALLET_JACK_UNKNOWN" });
  }

  const blocking = issues.some((issue) =>
    issue.kind === "EQUIPMENT_MISMATCH" ||
    issue.kind === "OVERWEIGHT" ||
    issue.kind === "TOO_LONG" ||
    issue.kind === "LIFTGATE_MISSING" ||
    issue.kind === "PALLET_JACK_MISSING",
  );
  return {
    status: blocking ? "INCOMPATIBLE" : issues.length ? "UNVERIFIED" : "OK",
    issues,
  };
}

export function isBlocking(issue: CompatibilityIssue): boolean {
  return (
    issue.kind === "EQUIPMENT_MISMATCH" ||
    issue.kind === "OVERWEIGHT" ||
    issue.kind === "TOO_LONG" ||
    issue.kind === "LIFTGATE_MISSING" ||
    issue.kind === "PALLET_JACK_MISSING"
  );
}
