/**
 * RATE CONFIRMATION EXTRACTION -- the shape asked for, and the cleanup after.
 *
 * A rate confirmation is the broker's own PDF: the lane, the load number, the
 * equipment and the total the carrier gets paid. Typing it into the load form
 * is the single most repeated piece of manual work in this app, and the one
 * that decides whether a new workspace ever fills up at all.
 *
 * The model is asked for the fields EXACTLY as printed, and for `null`
 * everywhere else. Every correction that follows -- state names to codes,
 * "$4,200.00" to 4200, "04/12/2026" to 2026-04-12 -- is deterministic and
 * lives here, so it is testable without an API key and without a network.
 *
 * Nothing in this module writes. What it produces is a PREFILL for the normal
 * load form; the owner still confirms every number against the document
 * before the load is saved. A rate con is a contract, not a data source we
 * get to trust.
 */

import { z } from "zod";

import { EQUIPMENT_TYPES } from "../load-details";
import type { EquipmentType } from "../types";

/** The tool the model must call. Forcing one is what makes the reply parseable. */
export const RATE_CON_TOOL_NAME = "record_rate_confirmation";

const EQUIPMENT_IDS = EQUIPMENT_TYPES.map((item) => item.id);

/**
 * JSON Schema handed to the model.
 *
 * Every property is required and nullable rather than optional: a model that
 * must emit the key is forced to decide "this document does not say", which
 * is a far better answer than a quietly dropped field.
 */
export const RATE_CON_TOOL_SCHEMA = {
  type: "object",
  properties: {
    broker: {
      type: ["string", "null"],
      description:
        "The broker or shipper paying the carrier, as printed on the document. Not the carrier, not the factoring company.",
    },
    loadNumber: {
      type: ["string", "null"],
      description: "The broker's load, order or pro number for this shipment.",
    },
    pickupDate: {
      type: ["string", "null"],
      description: "Scheduled pickup date, as YYYY-MM-DD. The FIRST pickup when there are several.",
    },
    deliveryDate: {
      type: ["string", "null"],
      description: "Scheduled delivery date, as YYYY-MM-DD. The LAST drop when there are several.",
    },
    originCity: { type: ["string", "null"], description: "City of the first pickup." },
    originState: {
      type: ["string", "null"],
      description: "State or province of the first pickup. Two-letter code when the document uses one.",
    },
    destinationCity: { type: ["string", "null"], description: "City of the final delivery." },
    destinationState: {
      type: ["string", "null"],
      description: "State or province of the final delivery. Two-letter code when the document uses one.",
    },
    loadedMiles: {
      type: ["number", "null"],
      description:
        "Loaded miles for the trip, only if the document states them. Never estimate a distance between the two cities.",
    },
    grossRate: {
      type: ["number", "null"],
      description:
        "TOTAL amount payable to the carrier, in US dollars: line haul plus fuel surcharge plus every listed accessorial. This is the single 'total rate' figure on the document, not the line haul alone.",
    },
    equipmentType: {
      type: ["string", "null"],
      enum: [...EQUIPMENT_IDS, null],
      description: "Trailer or truck type required for the load.",
    },
    equipmentLengthFt: {
      type: ["number", "null"],
      description: "Trailer length in feet, if stated (for example 53 or 26).",
    },
    weightLbs: { type: ["number", "null"], description: "Shipment weight in pounds, if stated." },
    commodity: { type: ["string", "null"], description: "What is being hauled, in a few words." },
  },
  required: [
    "broker",
    "loadNumber",
    "pickupDate",
    "deliveryDate",
    "originCity",
    "originState",
    "destinationCity",
    "destinationState",
    "loadedMiles",
    "grossRate",
    "equipmentType",
    "equipmentLengthFt",
    "weightLbs",
    "commodity",
  ],
  additionalProperties: false,
} as const;

/**
 * Deliberately forgiving. A model that answers "1,940" or "$4,200.00" where a
 * number was asked for is right about the document and wrong about the type;
 * rejecting the whole extraction over that would be the worst of both.
 */
const loose = z.union([z.string(), z.number(), z.boolean(), z.null()]).catch(null).default(null);

export const rateConExtractionSchema = z.object({
  broker: loose,
  loadNumber: loose,
  pickupDate: loose,
  deliveryDate: loose,
  originCity: loose,
  originState: loose,
  destinationCity: loose,
  destinationState: loose,
  loadedMiles: loose,
  grossRate: loose,
  equipmentType: loose,
  equipmentLengthFt: loose,
  weightLbs: loose,
  commodity: loose,
});

export type RateConExtraction = z.infer<typeof rateConExtractionSchema>;

/** The load-form fields a rate confirmation can fill, already cleaned up. */
export interface RateConFields {
  broker: string | null;
  loadNumber: string | null;
  date: string | null;
  deliveryDate: string | null;
  originCity: string | null;
  originState: string | null;
  destinationCity: string | null;
  destinationState: string | null;
  loadedMiles: number | null;
  grossRate: number | null;
  equipmentType: EquipmentType | null;
  equipmentLengthFt: number | null;
  weightLbs: number | null;
  commodity: string | null;
}

export type RateConField = keyof RateConFields;

export interface RateConReading {
  fields: RateConFields;
  /** Required load-form values this document did not contain. */
  missing: RateConField[];
}

/**
 * What the Messages API accepts as a document or an image. HEIC is not on it,
 * and the browser optimizer leaves HEIC alone, so an iPhone photo shared in
 * its original format is refused here rather than failing upstream.
 *
 * These live in this isomorphic module because the picker in the browser and
 * the route on the server must agree on them exactly.
 */
export const SCANNABLE_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

export const SCAN_ACCEPT_ATTRIBUTE = SCANNABLE_TYPES.join(",");

/** Comfortably inside the platform's request body ceiling, and far above a real rate con. */
export const MAX_SCAN_BYTES = 4 * 1024 * 1024;

export function isScannableType(contentType: string): boolean {
  return SCANNABLE_TYPES.includes(contentType);
}

/**
 * What the load form refuses to save without.
 *
 * Miles are on the list even though many rate cons never print them -- that
 * is exactly why the owner has to be told, rather than shown a form that
 * fails validation for reasons it does not explain.
 */
export const REQUIRED_RATE_CON_FIELDS: RateConField[] = [
  "date",
  "originCity",
  "originState",
  "destinationCity",
  "destinationState",
  "loadedMiles",
  "grossRate",
];

const STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO",
  "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT",
]);

const STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI",
  minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
  nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY",
  alberta: "AB", "british columbia": "BC", manitoba: "MB",
  "new brunswick": "NB", "newfoundland and labrador": "NL", "nova scotia": "NS",
  "northwest territories": "NT", nunavut: "NU", ontario: "ON",
  "prince edward island": "PE", quebec: "QC", "québec": "QC",
  saskatchewan: "SK", yukon: "YT",
};

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  // Models reach for these when a field is absent; they are not data.
  if (/^(n\/?a|none|null|unknown|not (stated|listed|specified|provided))$/i.test(trimmed)) return null;
  return trimmed.slice(0, max);
}

/** "$4,200.00", "4200", 4200 -- all the same number. Negatives are never a rate. */
function cleanNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== "string") return null;
  const digits = value.replace(/[^0-9.]/g, "");
  if (!digits) return null;
  const parsed = Number.parseFloat(digits);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function cleanMoney(value: unknown, max: number): number | null {
  const parsed = cleanNumber(value);
  if (parsed === null) return null;
  const rounded = Math.round(parsed * 100) / 100;
  return rounded > 0 && rounded <= max ? rounded : null;
}

function cleanInteger(value: unknown, max: number): number | null {
  const parsed = cleanNumber(value);
  if (parsed === null) return null;
  const rounded = Math.round(parsed);
  return rounded > 0 && rounded <= max ? rounded : null;
}

export function cleanState(value: unknown): string | null {
  const text = cleanText(value, 60);
  if (!text) return null;
  const upper = text.toUpperCase();
  if (STATE_CODES.has(upper)) return upper;
  const named = STATE_NAMES[text.toLowerCase()];
  if (named) return named;
  // "Laredo, TX" or "TX 78045" in a field that should have held the code.
  const trailing = upper.match(/\b([A-Z]{2})\b(?!.*\b[A-Z]{2}\b)/);
  return trailing && STATE_CODES.has(trailing[1]) ? trailing[1] : null;
}

/**
 * Dates. The model is asked for ISO, so ISO is the fast path; US-style
 * MM/DD/YYYY is accepted because that is what the document itself prints and
 * a model occasionally copies it verbatim. Anything else is dropped rather
 * than guessed -- 04/05 is two different dates on two continents.
 */
export function cleanDate(value: unknown): string | null {
  const text = cleanText(value, 40);
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return validDate(iso[1], iso[2], iso[3]);

  const us = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (us) {
    const year = us[3].length === 2 ? `20${us[3]}` : us[3];
    return validDate(year, us[1].padStart(2, "0"), us[2].padStart(2, "0"));
  }
  return null;
}

function validDate(year: string, month: string, day: string): string | null {
  const value = `${year}-${month}-${day}`;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Round-trip catches 2026-02-31, which Date happily rolls into March.
  if (parsed.toISOString().slice(0, 10) !== value) return null;
  const calendarYear = Number(year);
  return calendarYear >= 2000 && calendarYear <= 2100 ? value : null;
}

function cleanEquipment(value: unknown): EquipmentType | null {
  const text = cleanText(value, 40);
  if (!text) return null;
  const upper = text.toUpperCase().replace(/[\s-]+/g, "_");
  return (EQUIPMENT_IDS as string[]).includes(upper) ? (upper as EquipmentType) : null;
}

/**
 * Turns one model reply into load-form values.
 *
 * The caps mirror `loadSchema`: a number the form would reject is dropped
 * here instead, so the owner sees an empty field to fill rather than a
 * validation error on a value they never typed.
 */
export function normalizeExtraction(raw: RateConExtraction): RateConFields {
  const fields: RateConFields = {
    broker: cleanText(raw.broker, 120),
    loadNumber: cleanText(raw.loadNumber, 60),
    date: cleanDate(raw.pickupDate),
    deliveryDate: cleanDate(raw.deliveryDate),
    originCity: cleanText(raw.originCity, 80),
    originState: cleanState(raw.originState),
    destinationCity: cleanText(raw.destinationCity, 80),
    destinationState: cleanState(raw.destinationState),
    loadedMiles: cleanInteger(raw.loadedMiles, 100_000),
    grossRate: cleanMoney(raw.grossRate, 1_000_000),
    equipmentType: cleanEquipment(raw.equipmentType),
    equipmentLengthFt: cleanInteger(raw.equipmentLengthFt, 100),
    weightLbs: cleanInteger(raw.weightLbs, 200_000),
    commodity: cleanText(raw.commodity, 120),
  };

  // Delivery before pickup is a misread, not a shipment. The form refuses it,
  // so the weaker of the two dates goes rather than blocking the save.
  if (fields.date && fields.deliveryDate && fields.deliveryDate < fields.date) {
    fields.deliveryDate = null;
  }
  return fields;
}

/** The required fields this document did not give us. Drives the warning. */
export function missingRequiredFields(fields: RateConFields): RateConField[] {
  return REQUIRED_RATE_CON_FIELDS.filter((field) => fields[field] === null);
}

/** True when the reply is empty enough that it was probably not a rate con. */
export function isEmptyExtraction(fields: RateConFields): boolean {
  return Object.values(fields).every((value) => value === null);
}
