/**
 * WHAT THE MODEL MAY RETURN -- and the deterministic cleanup after it
 * ==================================================================
 *
 * The interpreter answers through ONE forced tool call whose every property
 * is required and nullable, so "the message does not say" is an explicit
 * null rather than a dropped key. Everything after that -- "$2,800" to 2800,
 * "Illinois" to IL, a negative rate to nothing -- happens here, without a
 * network and without a key, and is unit-tested.
 *
 * The model never sees the driver's profile, thresholds or verdicts, and it
 * never produces a number the bot prints as a result: it transcribes. The
 * TypeScript calculation engine does every piece of arithmetic.
 */

import { z } from "zod";

import { cleanDate, cleanState } from "../../rate-con/schema";
import { LOAD_EQUIPMENT, LOAD_KINDS, loadFactsSchema, type FactSource, type LoadFacts } from "../load-facts";

export const INTERPRET_TOOL_NAME = "record_freight_message";

export const INTENTS = [
  "LOAD",
  "OFFER",
  "WHAT_TO_ASK",
  "BROKER_MESSAGE",
  "SAVE",
  "HISTORY",
  "SETTINGS",
  "SEARCH",
  "HELP",
  "OTHER",
] as const;
export type Intent = (typeof INTENTS)[number];

const nullableString = (description: string) => ({ type: ["string", "null"], description });
const nullableNumber = (description: string) => ({ type: ["number", "null"], description });
const nullableBoolean = (description: string) => ({ type: ["boolean", "null"], description });

const LOAD_PROPERTIES = {
  originCity: nullableString("Pickup city (first pickup)."),
  originState: nullableString("Pickup state/province, two-letter code when shown."),
  destinationCity: nullableString("Delivery city (final drop)."),
  destinationState: nullableString("Delivery state/province, two-letter code when shown."),
  loadedMiles: nullableNumber(
    "LOADED miles, pickup to delivery, only if stated. On DAT/Truckstop this is the 'Trip' miles column. Never compute a distance yourself.",
  ),
  deadheadPickupMiles: nullableNumber(
    "Empty miles to reach the pickup, only if stated (DAT/Truckstop 'DH-O' / origin deadhead, or the driver saying '120 DH'). 0 is a valid value when the board shows 0.",
  ),
  deadheadAfterMiles: nullableNumber(
    "Empty miles AFTER delivery, ONLY if the driver explicitly says they will drive back or reposition empty. DAT's 'DH-D' column is NOT this -- return null for it.",
  ),
  grossRate: nullableNumber(
    "Total rate offered/posted in US dollars, all-in. Null if the posting shows no rate ('—', 'call', blank). Never the per-mile rate.",
  ),
  postedRatePerMile: nullableNumber("Rate per mile if the posting prints one (for reference only)."),
  pickupDate: nullableString("Pickup date as YYYY-MM-DD; null if no year can be determined from the content."),
  deliveryDate: nullableString("Delivery date as YYYY-MM-DD; null if not stated."),
  weightLbs: nullableNumber("Weight in pounds, if stated."),
  equipment: {
    type: ["string", "null"],
    enum: [...LOAD_EQUIPMENT, null],
    description: "Equipment the load requires, as stated. BOX_TRUCK = straight box truck. Null if not stated.",
  },
  equipmentLengthFt: nullableNumber("Required length in feet if stated (e.g. 26, 53)."),
  loadKind: { type: ["string", "null"], enum: [...LOAD_KINDS, null], description: "Full, partial, dedicated or round trip, only if stated." },
  extraStops: nullableNumber("Number of stops beyond the first pickup and final delivery, if stated."),
  liftgateRequired: nullableBoolean("True only if a liftgate is stated as required."),
  palletJackRequired: nullableBoolean("True only if a pallet jack is stated as required."),
  tolls: nullableNumber("Toll cost the driver states for this trip, in dollars."),
  otherCosts: nullableNumber("Other direct costs the driver states for this trip (lumper, etc.), in dollars."),
  brokerCompany: nullableString("Broker or shipper company name, as printed."),
  brokerContact: nullableString("Person at the broker, name only."),
  brokerMc: nullableString("Broker MC number, digits only."),
  brokerPhone: nullableString("Broker phone, as printed."),
  brokerEmail: nullableString("Broker email, as printed."),
  reference: nullableString("Load / PO / reference number, identifier only."),
  commodity: nullableString("What is hauled, a few words."),
  specialInstructions: nullableString("Special requirements in a short phrase (appointment, team, hazmat, TWIC...)."),
};

const LOAD_REQUIRED = Object.keys(LOAD_PROPERTIES);

export const INTERPRET_TOOL_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: [...INTENTS],
      description:
        "LOAD = details of a load to evaluate (new or more details of the current one). OFFER = a new rate for the load being discussed ('broker offered $1700'). WHAT_TO_ASK = asking what rate to quote / lowest to accept. BROKER_MESSAGE = wants a message to send a broker. SAVE, HISTORY, HELP as named. SETTINGS = wants to change their truck/fuel/fee settings. SEARCH = wants to find available loads. OTHER = anything else.",
    },
    language: { type: ["string", "null"], enum: ["en", "es", null], description: "Language the driver wrote or spoke in." },
    loads: {
      type: "array",
      maxItems: 5,
      description: "Loads described or visible. Usually one. A load-board screenshot may show several rows: list each (max 5) in the order shown. Empty when the message has no load.",
      items: { type: "object", properties: LOAD_PROPERTIES, required: LOAD_REQUIRED, additionalProperties: false },
    },
    search: {
      type: ["object", "null"],
      description: "Only for intent SEARCH.",
      properties: {
        nearCity: nullableString("City to search near."),
        nearState: nullableString("State of that city."),
        radiusMiles: nullableNumber("Search radius / max deadhead in miles."),
        towardState: nullableString("Destination state wanted, two-letter code."),
        minRatePerTotalMile: nullableNumber("Minimum $ per total mile wanted."),
        pickupDate: nullableString("Pickup date YYYY-MM-DD, if a specific date was given."),
      },
      required: ["nearCity", "nearState", "radiusMiles", "towardState", "minRatePerTotalMile", "pickupDate"],
      additionalProperties: false,
    },
  },
  required: ["intent", "language", "loads", "search"],
  additionalProperties: false,
} as const;

const loose = z.union([z.string(), z.number(), z.boolean(), z.null()]).catch(null).default(null);
const looseLoad = z.object(Object.fromEntries(LOAD_REQUIRED.map((key) => [key, loose]))).passthrough();

export const interpretationSchema = z.object({
  intent: z.enum(INTENTS).catch("OTHER"),
  language: z.enum(["en", "es"]).nullable().catch(null).default(null),
  loads: z.array(looseLoad).max(10).catch([]).default([]),
  search: z
    .object({
      nearCity: loose,
      nearState: loose,
      radiusMiles: loose,
      towardState: loose,
      minRatePerTotalMile: loose,
      pickupDate: loose,
    })
    .nullable()
    .catch(null)
    .default(null),
});

export interface SearchCriteria {
  nearCity: string | null;
  nearState: string | null;
  radiusMiles: number | null;
  towardState: string | null;
  minRatePerTotalMile: number | null;
  pickupDate: string | null;
}

export interface Interpretation {
  intent: Intent;
  language: "en" | "es" | null;
  loads: LoadFacts[];
  search: SearchCriteria | null;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  // Strip control characters and anything that looks like markup or a link
  // scheme -- the driver's own screenshot is not a channel for instructions.
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!trimmed || /^(n\/?a|none|null|unknown|not (stated|listed|specified|provided)|-+|—)$/i.test(trimmed)) return null;
  return trimmed.slice(0, max);
}

/** Numbers where 0 is meaningful (deadhead). */
function number(value: unknown, { min = 0, max, allowZero = false }: { min?: number; max: number; allowZero?: boolean }): number | null {
  let parsed: number | null = null;
  if (typeof value === "number") parsed = value;
  else if (typeof value === "string") {
    const digits = value.replace(/[^0-9.]/g, "");
    parsed = digits ? Number.parseFloat(digits) : null;
  }
  if (parsed === null || !Number.isFinite(parsed)) return null;
  if (parsed < min || parsed > max) return null;
  if (parsed === 0 && !allowZero) return null;
  return parsed;
}

function bool(value: unknown): boolean | null {
  return value === true ? true : value === false ? false : null;
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): T | null {
  if (typeof value !== "string") return null;
  const upper = value.toUpperCase().replace(/[\s-]+/g, "_") as T;
  return options.includes(upper) ? upper : null;
}

export function normalizeLoad(raw: Record<string, unknown>, source: FactSource): LoadFacts | null {
  const facts = {
    origin: { city: text(raw.originCity, 80), state: cleanState(raw.originState) },
    destination: { city: text(raw.destinationCity, 80), state: cleanState(raw.destinationState) },
    loadedMiles: number(raw.loadedMiles, { max: 10_000 }),
    deadheadPickupMiles: number(raw.deadheadPickupMiles, { max: 10_000, allowZero: true }),
    deadheadAfterMiles: number(raw.deadheadAfterMiles, { max: 10_000, allowZero: true }),
    grossRate: number(raw.grossRate, { max: 1_000_000 }),
    pickupDate: cleanDate(raw.pickupDate),
    deliveryDate: cleanDate(raw.deliveryDate),
    weightLbs: number(raw.weightLbs, { max: 200_000 }),
    equipment: oneOf(raw.equipment, LOAD_EQUIPMENT),
    equipmentLengthFt: number(raw.equipmentLengthFt, { max: 80 }),
    loadKind: oneOf(raw.loadKind, LOAD_KINDS),
    extraStops: (() => {
      const stops = number(raw.extraStops, { max: 50, allowZero: true });
      return stops === null ? null : Math.round(stops);
    })(),
    liftgateRequired: bool(raw.liftgateRequired),
    palletJackRequired: bool(raw.palletJackRequired),
    tolls: number(raw.tolls, { max: 5_000, allowZero: true }),
    otherCosts: number(raw.otherCosts, { max: 5_000, allowZero: true }),
    brokerCompany: text(raw.brokerCompany, 120),
    brokerContact: text(raw.brokerContact, 120)?.replace(/[^\p{L}\p{M} .'-]/gu, "").trim() || null,
    brokerMc: text(raw.brokerMc, 20)?.replace(/\D/g, "") || null,
    brokerPhone: text(raw.brokerPhone, 40),
    brokerEmail: text(raw.brokerEmail, 120),
    reference: text(raw.reference, 60),
    commodity: text(raw.commodity, 120),
    specialInstructions: text(raw.specialInstructions, 500),
    source,
  };
  if (!facts.origin.city && !facts.origin.state) (facts as { origin: unknown }).origin = null;
  if (!facts.destination.city && !facts.destination.state) (facts as { destination: unknown }).destination = null;
  // A delivery dated before its pickup is a misread, not a fact.
  if (facts.pickupDate && facts.deliveryDate && facts.deliveryDate < facts.pickupDate) facts.deliveryDate = null;

  const parsed = loadFactsSchema.safeParse(facts);
  if (!parsed.success) return null;
  const meaningful =
    parsed.data.loadedMiles !== null ||
    parsed.data.grossRate !== null ||
    parsed.data.deadheadPickupMiles !== null ||
    parsed.data.origin !== null ||
    parsed.data.destination !== null;
  return meaningful ? parsed.data : null;
}

export function normalizeInterpretation(raw: unknown, source: FactSource): Interpretation | null {
  const parsed = interpretationSchema.safeParse(raw);
  if (!parsed.success) return null;
  const loads = parsed.data.loads
    .map((load) => normalizeLoad(load as Record<string, unknown>, source))
    .filter((load): load is LoadFacts => load !== null)
    .slice(0, 5);
  const s = parsed.data.search;
  const search: SearchCriteria | null = s
    ? {
        nearCity: text(s.nearCity, 80),
        nearState: cleanState(s.nearState),
        radiusMiles: number(s.radiusMiles, { max: 1_000 }),
        towardState: cleanState(s.towardState),
        minRatePerTotalMile: number(s.minRatePerTotalMile, { max: 20 }),
        pickupDate: cleanDate(s.pickupDate),
      }
    : null;
  return { intent: parsed.data.intent, language: parsed.data.language, loads, search };
}
