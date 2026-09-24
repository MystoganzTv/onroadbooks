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
