import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Parses a form/number input that may be an empty string. */
export function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : fallback;
}

/**
 * For required numeric fields: an empty box means "missing", not zero.
 * Returning 0 let a cleared odometer or a cleared reserve percentage save
 * silently as 0 and pass every min(0) rule.
 */
export function toRequiredNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || String(value).trim() === "") return undefined;
  const n = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : undefined;
}

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "TruckLedger";
