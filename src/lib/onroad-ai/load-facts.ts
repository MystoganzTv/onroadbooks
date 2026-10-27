/**
 * LOAD FACTS
 * ==========
 *
 * What a driver told us about one load -- typed in, read off a screenshot,
 * a rate confirmation or a voice note. Every field is nullable because
 * "not stated" is a real answer and the bot must never fill it in.
 *
 * The three mileage fields are kept apart on purpose. A DAT or Truckstop
 * screenshot prints the trip (loaded) miles and the distance from the
 * searcher to the pickup (DH-O) side by side; mixing them up moves the real
 * RPM by 10-20 %. Deadhead AFTER delivery only exists when the driver says
 * so -- we never invent a return leg.
 */

import { z } from "zod";

export const LOAD_EQUIPMENT = [
  "BOX_TRUCK",
  "REEFER_BOX",
  "CARGO_VAN",
  "HOTSHOT",
  "DRY_VAN",
  "REEFER",
  "FLATBED",
  "POWER_ONLY",
  "OTHER",
] as const;
export type LoadEquipment = (typeof LOAD_EQUIPMENT)[number];

export const LOAD_KINDS = ["FULL", "PARTIAL", "DEDICATED", "ROUND_TRIP"] as const;
export type LoadKind = (typeof LOAD_KINDS)[number];

export const FACT_SOURCES = ["TEXT", "IMAGE", "PDF", "VOICE"] as const;
export type FactSource = (typeof FACT_SOURCES)[number];

const place = z.object({
  city: z.string().trim().min(1).max(80).nullable().default(null),
  state: z.string().trim().min(2).max(40).nullable().default(null),
});
export type Place = z.infer<typeof place>;

const miles = z.number().finite().min(0).max(10_000).nullable().default(null);
const dollars = z.number().finite().min(0).max(1_000_000).nullable().default(null);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null);
const text = (max: number) => z.string().trim().min(1).max(max).nullable().default(null);

export const loadFactsSchema = z.object({
  origin: place.nullable().default(null),
  destination: place.nullable().default(null),
  loadedMiles: miles,
  deadheadPickupMiles: miles,
  deadheadAfterMiles: miles,
  grossRate: dollars,
  pickupDate: isoDate,
  deliveryDate: isoDate,
  weightLbs: z.number().finite().min(0).max(200_000).nullable().default(null),
  equipment: z.enum(LOAD_EQUIPMENT).nullable().default(null),
  equipmentLengthFt: z.number().finite().positive().max(80).nullable().default(null),
  loadKind: z.enum(LOAD_KINDS).nullable().default(null),
  extraStops: z.number().int().min(0).max(50).nullable().default(null),
  liftgateRequired: z.boolean().nullable().default(null),
  palletJackRequired: z.boolean().nullable().default(null),
  tolls: dollars,
  otherCosts: dollars,
  brokerCompany: text(120),
  brokerContact: text(120),
  brokerMc: text(20),
  brokerPhone: text(40),
  brokerEmail: text(120),
  reference: text(60),
  commodity: text(120),
  specialInstructions: text(500),
  source: z.enum(FACT_SOURCES).default("TEXT"),
});

export type LoadFacts = z.infer<typeof loadFactsSchema>;

export function emptyFacts(source: FactSource = "TEXT"): LoadFacts {
  return loadFactsSchema.parse({ source });
}

/**
 * Overlay `update` onto `base`, field by field. A null in the update means
 * "this message did not mention it", never "erase it" -- so "broker offered
 * $1,700" changes the rate and leaves the miles alone.
 */
export function mergeFacts(base: LoadFacts, update: Partial<LoadFacts>): LoadFacts {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(update)) {
    if (value === null || value === undefined) continue;
    if ((key === "origin" || key === "destination") && typeof value === "object") {
      const previous = (base[key] ?? { city: null, state: null }) as Place;
      const next = value as Place;
      merged[key] = { city: next.city ?? previous.city, state: next.state ?? previous.state };
      continue;
    }
    merged[key] = value;
  }
  const parsed = loadFactsSchema.safeParse(merged);
  return parsed.success ? parsed.data : base;
}

/** Fields without which no financial result can be produced. */
export type CriticalField = "loadedMiles" | "deadheadPickupMiles" | "grossRate";

/**
 * In order of asking. The rate is only critical when the driver wants a
 * verdict on an offer; "what should I ask for this lane?" works without it.
 */
export function missingCriticalFields(facts: LoadFacts, needOffer: boolean): CriticalField[] {
  const missing: CriticalField[] = [];
  if (facts.loadedMiles === null || facts.loadedMiles <= 0) missing.push("loadedMiles");
  if (facts.deadheadPickupMiles === null) missing.push("deadheadPickupMiles");
  if (needOffer && (facts.grossRate === null || facts.grossRate <= 0)) missing.push("grossRate");
  return missing;
}

export function placeLabel(value: Place | null): string | null {
  if (!value) return null;
  const parts = [value.city, value.state].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(", ") : null;
}

export function laneLabel(facts: LoadFacts): string | null {
  const from = placeLabel(facts.origin);
  const to = placeLabel(facts.destination);
  if (!from && !to) return null;
  return `${from ?? "?"} → ${to ?? "?"}`;
}
