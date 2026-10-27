/**
 * DRIVER PROFILE
 * ==============
 *
 * One profile per WhatsApp user. It holds every number the load calculator
 * needs that is not on the load itself: MPG, diesel, fees, maintenance, the
 * owner's operational minimum and rating thresholds, plus the truck's
 * physical limits used to check equipment compatibility.
 *
 * Nothing here is a global constant the bot applies to everyone. The
 * STARTER_PROFILE values are only what onboarding OFFERS ("reply OK to use
 * 8.5 MPG"); a user who never confirms them still gets asked.
 *
 * Profiles are stored as JSON and parsed on every read with `parseProfile`,
 * which fills fields added after the row was written -- the same
 * migrate-on-read approach the JSON ledger uses, so an old profile never
 * breaks a new release.
 */

import { z } from "zod";

import { DEFAULT_RATING_THRESHOLDS, type RatingThresholds } from "../calculations";
import { DEFAULT_MAINTENANCE_PER_MILE, DEFAULT_MIN_RATE_PER_TOTAL_MILE, type FeeMode } from "../finance/load-calculator";

export type BotLocale = "en" | "es";

/**
 * What the driver runs. Deliberately not interchangeable: a straight box
 * truck is not a dry van, and a hotshot is not a flatbed.
 */
export const TRUCK_TYPES = [
  "BOX_TRUCK",
  "REEFER_BOX",
  "CARGO_VAN",
  "HOTSHOT",
  "DRY_VAN",
  "REEFER",
  "FLATBED",
  "OTHER",
] as const;
export type TruckType = (typeof TRUCK_TYPES)[number];

/** Same as FinancialSettings.deadheadWarnPct's column default. */
export const DEFAULT_DEADHEAD_WARN_PCT = 20;
/** One driver, hours-of-service: a planning figure, editable per user. */
export const DEFAULT_MAX_MILES_PER_DAY = 600;

const feeMode = z.enum(["PCT", "AMOUNT"]);
const money = z.number().finite().min(0);

export const driverProfileSchema = z.object({
  locale: z.enum(["en", "es"]).default("en"),
  truckType: z.enum(TRUCK_TYPES).nullable().default(null),
  truckLengthFt: z.number().finite().positive().max(80).nullable().default(null),
  cargoCapacityLbs: z.number().finite().positive().max(80_000).nullable().default(null),
  truckHeightFt: z.number().finite().positive().max(15).nullable().default(null),
  hasLiftgate: z.boolean().nullable().default(null),
  hasPalletJack: z.boolean().nullable().default(null),
  mpg: z.number().finite().positive().max(40).nullable().default(null),
  fuelPrice: z.number().finite().positive().max(20).nullable().default(null),
  dispatchMode: feeMode.default("PCT"),
  dispatchValue: money.nullable().default(null),
  factoringMode: feeMode.default("PCT"),
  factoringValue: money.nullable().default(null),
  maintenancePerMile: money.max(5).default(DEFAULT_MAINTENANCE_PER_MILE),
  /** Gross per TOTAL mile, deadhead included. 0 = no floor. */
  minRatePerTotalMile: money.max(20).nullable().default(null),
  ratingGreat: money.max(20).default(DEFAULT_RATING_THRESHOLDS.great),
  ratingGood: money.max(20).default(DEFAULT_RATING_THRESHOLDS.good),
  ratingMarginal: money.max(20).default(DEFAULT_RATING_THRESHOLDS.marginal),
  deadheadWarnPct: z.number().finite().min(0).max(100).default(DEFAULT_DEADHEAD_WARN_PCT),
  maxDeadheadMiles: z.number().finite().positive().max(2_000).nullable().default(null),
  maxMilesPerDay: z.number().finite().positive().max(1_500).default(DEFAULT_MAX_MILES_PER_DAY),
  /** Tolls assumed when a load does not state any. 0 = assume none (and say so). */
  defaultTolls: money.max(5_000).default(0),
  /** Any other direct cost the driver wants on every load (lumper, parking at the dock...). */
  defaultOtherCost: money.max(5_000).default(0),
  preferredOrigins: z.array(z.string().min(1).max(60)).max(10).default([]),
  preferredDestinations: z.array(z.string().min(1).max(60)).max(10).default([]),
  preferredFreight: z.array(z.string().min(1).max(60)).max(10).default([]),
});

export type DriverProfile = z.infer<typeof driverProfileSchema>;

/** Blank profile: every calculator input unanswered. */
export function emptyProfile(locale: BotLocale = "en"): DriverProfile {
  return driverProfileSchema.parse({ locale });
}

/**
 * Parses whatever is stored, dropping (not crashing on) a field that no
 * longer validates. A corrupt MPG becomes "not set" and onboarding asks
 * for it again; it never becomes a silent default.
 */
export function parseProfile(raw: unknown): DriverProfile {
  const direct = driverProfileSchema.safeParse(raw ?? {});
  if (direct.success) return direct.data;
  const source = raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {};
  for (const issue of direct.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string") delete source[key];
  }
  const repaired = driverProfileSchema.safeParse(source);
  return repaired.success ? repaired.data : emptyProfile();
}

/**
 * What onboarding offers for each question. The user's own example truck
 * (26 ft straight box, 8.5 MPG, 5% dispatch, 3.5% factoring, $0.20/mi
 * maintenance, $1.80/total mile floor). Never applied without a reply.
 */
export const STARTER_PROFILE = {
  truckType: "BOX_TRUCK" as TruckType,
  truckLengthFt: 26,
  mpg: 8.5,
  fuelPrice: 6.7,
  dispatchMode: "PCT" as FeeMode,
  dispatchValue: 5,
  factoringMode: "PCT" as FeeMode,
  factoringValue: 3.5,
  maintenancePerMile: DEFAULT_MAINTENANCE_PER_MILE,
  minRatePerTotalMile: DEFAULT_MIN_RATE_PER_TOTAL_MILE,
} as const;

export function thresholdsOf(profile: DriverProfile): RatingThresholds {
  return {
    great: profile.ratingGreat,
    good: profile.ratingGood,
    marginal: profile.ratingMarginal,
  };
}

/** The calculator inputs a profile must answer before any load can be priced. */
export type RequiredProfileField = "mpg" | "fuelPrice" | "dispatchValue" | "factoringValue" | "minRatePerTotalMile";

export function missingProfileFields(profile: DriverProfile): RequiredProfileField[] {
  const missing: RequiredProfileField[] = [];
  if (profile.mpg === null) missing.push("mpg");
  if (profile.fuelPrice === null) missing.push("fuelPrice");
  if (profile.dispatchValue === null) missing.push("dispatchValue");
  if (profile.factoringValue === null) missing.push("factoringValue");
  if (profile.minRatePerTotalMile === null) missing.push("minRatePerTotalMile");
  return missing;
}

/** Rating thresholds must stay ordered or the GREAT/GOOD/MARGINAL bands overlap. */
export function thresholdOrderError(profile: DriverProfile): string | null {
  if (!(profile.ratingGreat >= profile.ratingGood && profile.ratingGood >= profile.ratingMarginal)) {
    return "great >= good >= marginal";
  }
  return null;
}
