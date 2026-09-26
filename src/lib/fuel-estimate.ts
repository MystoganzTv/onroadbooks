import { addDays } from "./periods";
import type { FuelEntry } from "./types";

/**
 * What a mile of fuel costs one truck, for estimating a load before its
 * receipts are in. One rule for every screen -- load detail, the loads list,
 * reports, both calculators -- so the same trip never prices two ways
 * (ADR 0030).
 *
 * In order of preference:
 *
 *  1. MPG: the owner's reference MPG for the truck x the price this truck
 *     actually paid -- its latest fill-up in the last 30 days, else its
 *     average over 90 days. Transparent: "308 mi / 8.5 MPG x $6.40/gal".
 *  2. LEDGER: fuel dollars / miles over the trailing basis, when there is
 *     no MPG (or no recent price). Measured, but noisy while history is
 *     short, because a full tank bought today pays for miles not yet driven.
 *  3. Nothing. The load says "not available" rather than $0.
 *
 * Nothing here invents an MPG or a price: both come from the owner.
 */

export const FUEL_PRICE_RECENT_DAYS = 30;
export const FUEL_PRICE_AVERAGE_DAYS = 90;
/** Miles of ledger history before a measured rate is trusted as a check. */
export const FUEL_CHECK_MIN_MILES = 2_000;
/** How far measured and reference may drift apart before the truck says so. */
export const FUEL_CHECK_TOLERANCE = 0.1;

export interface FuelPrice {
  pricePerGallon: number;
  source: "LATEST" | "AVERAGE";
  /** The fill-up's date for LATEST; null for an average. */
  date: string | null;
}

export type FuelRateSource = "MPG" | "LEDGER";

export interface FuelRate {
  perMile: number;
  source: FuelRateSource;
  mpg: number | null;
  price: FuelPrice | null;
}

/** The price this truck paid for fuel recently, from its own fill-ups. */
export function recentFuelPrice(
  entries: Pick<FuelEntry, "truckId" | "date" | "gallons" | "pricePerGallon" | "totalCost">[],
  truckId: string,
  today: string,
): FuelPrice | null {
  const own = entries
    .filter((entry) => entry.truckId === truckId && entry.gallons > 0 && entry.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date));
  const latest = own[0];
  if (latest && latest.date >= addDays(today, -FUEL_PRICE_RECENT_DAYS)) {
    const price = latest.pricePerGallon > 0 ? latest.pricePerGallon : latest.totalCost / latest.gallons;
    if (price > 0) return { pricePerGallon: price, source: "LATEST", date: latest.date };
  }
  const window = own.filter((entry) => entry.date >= addDays(today, -FUEL_PRICE_AVERAGE_DAYS));
  const gallons = window.reduce((total, entry) => total + entry.gallons, 0);
  const cost = window.reduce((total, entry) => total + entry.totalCost, 0);
  return gallons > 0 && cost > 0
    ? { pricePerGallon: cost / gallons, source: "AVERAGE", date: null }
    : null;
}

export function fuelRate(input: {
  referenceMpg: number | null | undefined;
  price: FuelPrice | null;
  /** Fuel dollars per mile measured from the ledger, or null when too thin. */
  ledgerPerMile: number | null;
}): FuelRate | null {
  const mpg = input.referenceMpg && input.referenceMpg > 0 ? input.referenceMpg : null;
  if (mpg && input.price) {
    return { perMile: input.price.pricePerGallon / mpg, source: "MPG", mpg, price: input.price };
  }
  if (input.ledgerPerMile !== null && input.ledgerPerMile > 0) {
    return { perMile: input.ledgerPerMile, source: "LEDGER", mpg: null, price: input.price };
  }
  return null;
}

export interface FuelReferenceCheck {
  measuredPerMile: number;
  referencePerMile: number;
  /** The MPG the ledger implies at the same price. */
  impliedMpg: number;
  /** Positive when the ledger costs more than the reference says. */
  differencePct: number;
}

/**
 * Measured against reference, once there is enough history to mean
 * something. A ledger that runs well above the reference usually means the
 * truck does worse than its MPG, or it drives miles no load records
 * (bobtail home, unlogged deadhead) -- a real cost the MPG estimate cannot see.
 */
export function fuelReferenceCheck(input: {
  rate: FuelRate | null;
  ledgerPerMile: number | null;
  ledgerMiles: number;
}): FuelReferenceCheck | null {
  const { rate, ledgerPerMile } = input;
  if (!rate || rate.source !== "MPG" || !rate.price || ledgerPerMile === null || ledgerPerMile <= 0) return null;
  if (input.ledgerMiles < FUEL_CHECK_MIN_MILES) return null;
  const differencePct = (ledgerPerMile - rate.perMile) / rate.perMile;
  if (Math.abs(differencePct) <= FUEL_CHECK_TOLERANCE) return null;
  return {
    measuredPerMile: ledgerPerMile,
    referencePerMile: rate.perMile,
    impliedMpg: rate.price.pricePerGallon / ledgerPerMile,
    differencePct,
  };
}
