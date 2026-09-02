import { roundMoney, sum } from "./calculations";
import type { Dataset, JurisdictionMileage } from "./types";

/** IFTA member jurisdictions: the contiguous United States and Canadian provinces. */
export const IFTA_JURISDICTIONS = [
  "AB", "AL", "AR", "AZ", "BC", "CA", "CO", "CT", "DE", "FL", "GA", "IA", "ID",
  "IL", "IN", "KS", "KY", "LA", "MA", "MB", "MD", "ME", "MI", "MN", "MO", "MS",
  "MT", "NB", "NC", "ND", "NE", "NH", "NJ", "NL", "NM", "NS", "NV", "NY",
  "OH", "OK", "ON", "OR", "PA", "PE", "QC", "RI", "SC", "SD", "SK", "TN", "TX",
  "UT", "VA", "VT", "WA", "WI", "WV", "WY",
] as const;

export type IftaJurisdiction = (typeof IFTA_JURISDICTIONS)[number];
const IFTA_SET = new Set<string>(IFTA_JURISDICTIONS);

export function isIftaJurisdiction(value: string): value is IftaJurisdiction {
  return IFTA_SET.has(value.trim().toUpperCase());
}

export function inferFuelJurisdiction(location: string | null | undefined): string | null {
  const match = location?.trim().toUpperCase().match(/(?:,|\s)\s*([A-Z]{2})(?:\s+\d{5})?$/);
  return match && isIftaJurisdiction(match[1]) ? match[1] : null;
}

export function normalizeJurisdictionMiles(value: unknown): JurisdictionMileage[] {
  if (!Array.isArray(value)) return [];
  const merged = new Map<string, JurisdictionMileage>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Partial<JurisdictionMileage>;
    const jurisdiction = String(item.jurisdiction ?? "").trim().toUpperCase();
    if (!isIftaJurisdiction(jurisdiction)) continue;
    const totalMiles = Math.max(0, Math.round(Number(item.totalMiles) || 0));
    const nonTaxableMiles = Math.min(
      totalMiles,
      Math.max(0, Math.round(Number(item.nonTaxableMiles) || 0)),
    );
    if (totalMiles === 0) continue;
    const existing = merged.get(jurisdiction);
    merged.set(jurisdiction, {
      jurisdiction,
      totalMiles: (existing?.totalMiles ?? 0) + totalMiles,
      nonTaxableMiles: (existing?.nonTaxableMiles ?? 0) + nonTaxableMiles,
    });
  }
  return [...merged.values()]
    .map((row) => ({ ...row, nonTaxableMiles: Math.min(row.totalMiles, row.nonTaxableMiles) }))
    .sort((a, b) => a.jurisdiction.localeCompare(b.jurisdiction));
}

export function iftaQuarter(date: string | Date): string {
  const parsed = typeof date === "string" ? new Date(`${date.slice(0, 10)}T00:00:00Z`) : date;
  const year = parsed.getUTCFullYear();
  const quarter = Math.floor(parsed.getUTCMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
}

export function currentIftaQuarter(now = new Date()): string {
  return iftaQuarter(now);
}

export function iftaQuarterBounds(quarter: string): { start: string; end: string } {
  const match = /^(\d{4})-Q([1-4])$/.exec(quarter);
  if (!match) throw new Error("Use an IFTA quarter such as 2026-Q3.");
  const year = Number(match[1]);
  const q = Number(match[2]);
  const startMonth = (q - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function iftaRateKey(quarter: string, jurisdiction: string): string {
  return `${quarter}:${jurisdiction.toUpperCase()}`;
}

export interface IftaJurisdictionResult {
  jurisdiction: string;
  totalMiles: number;
  nonTaxableMiles: number;
  taxableMiles: number;
  taxPaidGallons: number;
  taxableGallons: number;
  netTaxableGallons: number;
  taxRate: number | null;
  taxDue: number | null;
}

export interface IftaReport {
  quarter: string;
  start: string;
  end: string;
  totalFleetMiles: number;
  assignedMiles: number;
  unassignedMiles: number;
  totalGallons: number;
  unassignedGallons: number;
  fleetMpg: number;
  missingRateJurisdictions: string[];
  complete: boolean;
  jurisdictions: IftaJurisdictionResult[];
  netTaxDue: number | null;
}

export function calculateIftaReport(
  dataset: Dataset,
  quarter: string,
  truckId: string | null = null,
  includedTruckIds: readonly string[] | null = null,
): IftaReport {
  const { start, end } = iftaQuarterBounds(quarter);
  const included = includedTruckIds == null ? null : new Set(includedTruckIds);
  const truckIsInScope = (candidateId: string) =>
    truckId ? candidateId === truckId : included == null || included.has(candidateId);
  const loads = dataset.loads.filter(
    (load) => load.date >= start && load.date <= end && truckIsInScope(load.truckId),
  );
  const fuel = dataset.fuelEntries.filter(
    (entry) => entry.date >= start && entry.date <= end && truckIsInScope(entry.truckId),
  );
  const totalFleetMiles = sum(loads, (load) => load.loadedMiles + load.deadheadMiles);
  const buckets = new Map<string, { totalMiles: number; nonTaxableMiles: number; gallons: number }>();

  for (const load of loads) {
    for (const mileage of normalizeJurisdictionMiles(load.jurisdictionMiles)) {
      const bucket = buckets.get(mileage.jurisdiction) ?? { totalMiles: 0, nonTaxableMiles: 0, gallons: 0 };
      bucket.totalMiles += mileage.totalMiles;
      bucket.nonTaxableMiles += mileage.nonTaxableMiles;
      buckets.set(mileage.jurisdiction, bucket);
    }
  }

  let unassignedGallons = 0;
  for (const entry of fuel) {
    // Filing math uses the jurisdiction stored on the purchase. A location is
    // helpful as a form suggestion, but is not evidence strong enough to make
    // a draft filing look complete.
    const jurisdiction = entry.jurisdiction;
    if (!jurisdiction) {
      unassignedGallons += entry.gallons;
      continue;
    }
    const bucket = buckets.get(jurisdiction) ?? { totalMiles: 0, nonTaxableMiles: 0, gallons: 0 };
    bucket.gallons += entry.gallons;
    buckets.set(jurisdiction, bucket);
  }

  const assignedMiles = [...buckets.values()].reduce((total, row) => total + row.totalMiles, 0);
  const totalGallons = sum(fuel, (entry) => entry.gallons);
  const fleetMpg = totalGallons > 0 ? totalFleetMiles / totalGallons : 0;
  const jurisdictions = [...buckets.entries()]
    .map(([jurisdiction, bucket]): IftaJurisdictionResult => {
      const nonTaxableMiles = Math.min(bucket.totalMiles, bucket.nonTaxableMiles);
      const taxableMiles = bucket.totalMiles - nonTaxableMiles;
      const taxableGallons = fleetMpg > 0 ? taxableMiles / fleetMpg : 0;
      const netTaxableGallons = taxableGallons - bucket.gallons;
      const rate = dataset.settings.iftaTaxRates[iftaRateKey(quarter, jurisdiction)];
      const taxRate = Number.isFinite(rate) ? rate : null;
      return {
        jurisdiction,
        totalMiles: bucket.totalMiles,
        nonTaxableMiles,
        taxableMiles,
        taxPaidGallons: Number(bucket.gallons.toFixed(3)),
        taxableGallons: Number(taxableGallons.toFixed(3)),
        netTaxableGallons: Number(netTaxableGallons.toFixed(3)),
        taxRate,
        taxDue: taxRate == null ? null : roundMoney(netTaxableGallons * taxRate),
      };
    })
    .filter((row) => row.totalMiles > 0 || row.taxPaidGallons > 0)
    .sort((a, b) => a.jurisdiction.localeCompare(b.jurisdiction));
  const missingRateJurisdictions = jurisdictions
    .filter((row) => row.taxableMiles > 0 && row.taxRate == null)
    .map((row) => row.jurisdiction);
  const complete =
    totalFleetMiles > 0 &&
    totalGallons > 0 &&
    assignedMiles === totalFleetMiles &&
    unassignedGallons === 0 &&
    missingRateJurisdictions.length === 0;
  return {
    quarter,
    start,
    end,
    totalFleetMiles,
    assignedMiles,
    unassignedMiles: Math.max(0, totalFleetMiles - assignedMiles),
    totalGallons: Number(totalGallons.toFixed(3)),
    unassignedGallons: Number(unassignedGallons.toFixed(3)),
    fleetMpg: Number(fleetMpg.toFixed(3)),
    missingRateJurisdictions,
    complete,
    jurisdictions,
    netTaxDue: missingRateJurisdictions.length
      ? null
      : roundMoney(jurisdictions.reduce((total, row) => total + (row.taxDue ?? 0), 0)),
  };
}
