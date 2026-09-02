import type { Truck } from "./types";

/**
 * A product-facing assessment, not a tax ruling. Jurisdiction-specific
 * exemptions still belong with the carrier's base jurisdiction.
 */
export type IftaApplicability = "LIKELY_REQUIRED" | "LIKELY_NOT_REQUIRED" | "UNKNOWN";

type IftaTruckFacts = Pick<
  Truck,
  "axleCount" | "registeredGrossWeightLbs" | "operatesInMultipleIftaJurisdictions"
>;

export function iftaApplicability(truck: IftaTruckFacts): IftaApplicability {
  const crosses = truck.operatesInMultipleIftaJurisdictions;
  const axles = truck.axleCount;
  const weight = truck.registeredGrossWeightLbs;

  if (crosses === false) return "LIKELY_NOT_REQUIRED";
  if (crosses !== true) return "UNKNOWN";

  if ((axles ?? 0) >= 3 || (weight ?? 0) > 26_000) return "LIKELY_REQUIRED";
  if (axles != null && weight != null) return "LIKELY_NOT_REQUIRED";
  return "UNKNOWN";
}

/** One qualifying unit makes IFTA relevant to the workspace. */
export function fleetIftaApplicability(trucks: IftaTruckFacts[]): IftaApplicability {
  const states = trucks.map(iftaApplicability);
  if (states.includes("LIKELY_REQUIRED")) return "LIKELY_REQUIRED";
  if (states.includes("UNKNOWN")) return "UNKNOWN";
  return "LIKELY_NOT_REQUIRED";
}

export function iftaApplicabilityLabel(status: IftaApplicability): string {
  if (status === "LIKELY_REQUIRED") return "IFTA tracking recommended";
  if (status === "LIKELY_NOT_REQUIRED") return "IFTA not indicated by this profile";
  return "IFTA status needs vehicle details";
}

/** Explicit owner decisions, kept separate from the product's recommendation. */
export function iftaReportingTruckIds(
  trucks: Pick<Truck, "id" | "iftaReportingEnabled">[],
): string[] {
  return trucks.filter((truck) => truck.iftaReportingEnabled === true).map((truck) => truck.id);
}

export function iftaReportingLabel(
  enabled: boolean | null | undefined,
): "Included" | "Excluded" | "Decision needed" {
  if (enabled === true) return "Included";
  if (enabled === false) return "Excluded";
  return "Decision needed";
}
