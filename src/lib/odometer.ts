/**
 * Odometer input parsing and plausibility checks.
 *
 * Readings are stored as whole miles. A reading like "271.184" is the classic
 * typo: the driver meant 271,184 but typed the thousands separator as a
 * decimal point. Saving it as-is either fails in the database or records a
 * reading hundreds of thousands of miles too low, which corrupts MPG and the
 * truck's current odometer. So the form never guesses silently: anything that
 * is not an unambiguous whole number is shown back to the user to confirm.
 */

export type DecimalSeparator = "." | ",";

export type OdometerParse =
  | { kind: "empty" }
  | { kind: "ok"; value: number }
  /** Parsed, but the separator could have meant a decimal. Confirm `value` with the user. */
  | { kind: "suspect"; value: number }
  | { kind: "invalid" };

export const MAX_ODOMETER = 5_000_000;
/** A jump larger than this since the last reading is flagged as a probable extra digit. */
export const ODOMETER_JUMP_WARNING = 10_000;

export function parseOdometerInput(raw: string, decimalSeparator: DecimalSeparator): OdometerParse {
  const text = raw.trim().replace(/[\s  ]/g, "");
  if (text === "") return { kind: "empty" };

  const checked = (value: number, kind: "ok" | "suspect"): OdometerParse =>
    Number.isSafeInteger(value) && value <= MAX_ODOMETER ? { kind, value } : { kind: "invalid" };

  if (/^\d+$/.test(text)) return checked(Number(text), "ok");

  // Thousands grouping with one consistent separator: 271,184 / 1.271.184
  const grouped = /^\d{1,3}(?:([.,])\d{3})(?:\1\d{3})*$/.exec(text);
  if (grouped) {
    const separator = grouped[1];
    const value = Number(text.split(separator).join(""));
    const groups = text.split(separator).length - 1;
    // "271.184" in English is literally 271.184 miles; confirm rather than guess.
    return checked(value, separator === decimalSeparator && groups === 1 ? "suspect" : "ok");
  }

  // A fractional reading (tenths on the dash): offer the rounded whole mile.
  const fraction = /^(\d+)[.,](\d{1,2})$/.exec(text);
  if (fraction) return checked(Math.round(Number(`${fraction[1]}.${fraction[2]}`)), "suspect");

  return { kind: "invalid" };
}

export type OdometerConcern =
  | { kind: "below"; reference: number }
  | { kind: "jump"; reference: number; miles: number };

/** Readings never go backward, and rarely jump by thousands between fill-ups. */
export function odometerConcern(
  value: number,
  reference: number | null | undefined,
  maxJump = ODOMETER_JUMP_WARNING,
): OdometerConcern | null {
  if (!reference || reference <= 0) return null;
  if (value < reference) return { kind: "below", reference };
  if (value - reference > maxJump) return { kind: "jump", reference, miles: value - reference };
  return null;
}

export function decimalSeparatorFor(localeTag: string): DecimalSeparator {
  const part = new Intl.NumberFormat(localeTag).formatToParts(1.5).find((p) => p.type === "decimal");
  return part?.value === "," ? "," : ".";
}

export interface OdometerReading {
  id?: string;
  date: string;
  odometer: number | null | undefined;
}

export type DatedOdometerConcern =
  | { kind: "below"; reference: number; referenceDate: string }
  | { kind: "above"; reference: number; referenceDate: string }
  | { kind: "jump"; reference: number; referenceDate: string; miles: number };

/**
 * Receipts arrive in any order -- Tuesday's can be entered after Wednesday's
 * -- so a reading is judged against the DATES around it, never against
 * whatever was typed last. A Monday receipt with fewer miles than Tuesday's is
 * normal. What cannot happen is an earlier day reading MORE than a later day,
 * or a later day reading LESS than an earlier one. Readings on the same day
 * are not compared: the order of two fill-ups on one date is unknown.
 *
 * The jump check only applies when nothing later is on file; a reading that
 * fits between an earlier and a later one is consistent by definition.
 */
export function odometerConcernOnDate(
  value: number,
  date: string,
  readings: OdometerReading[],
  { excludeId, maxJump = ODOMETER_JUMP_WARNING }: { excludeId?: string; maxJump?: number } = {},
): DatedOdometerConcern | null {
  let before: { odometer: number; date: string } | null = null;
  let after: { odometer: number; date: string } | null = null;
  for (const reading of readings) {
    if (excludeId && reading.id === excludeId) continue;
    const odometer = reading.odometer;
    if (typeof odometer !== "number" || !(odometer > 0)) continue;
    if (reading.date < date) {
      if (!before || odometer > before.odometer) before = { odometer, date: reading.date };
    } else if (reading.date > date) {
      if (!after || odometer < after.odometer) after = { odometer, date: reading.date };
    }
  }
  if (before && value < before.odometer) return { kind: "below", reference: before.odometer, referenceDate: before.date };
  if (after && value > after.odometer) return { kind: "above", reference: after.odometer, referenceDate: after.date };
  if (before && !after && value - before.odometer > maxJump) {
    return { kind: "jump", reference: before.odometer, referenceDate: before.date, miles: value - before.odometer };
  }
  return null;
}
