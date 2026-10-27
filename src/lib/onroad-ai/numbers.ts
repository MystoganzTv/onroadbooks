/**
 * Phone-sized number formatting. Display only -- every value arrives already
 * rounded by the calculation engine, and nothing here feeds back into math.
 *
 * Money keeps its cents when it has any ($1,514.04) so the lines of the
 * breakdown add up to the contribution exactly; whole amounts drop them
 * ($2,800) because that is how a rate is said on the phone.
 */

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function money(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(safe);
  const hasCents = Math.round(abs * 100) % 100 !== 0;
  const body = hasCents ? cents.format(abs) : whole.format(Math.round(abs));
  return `${safe < 0 ? "-" : ""}$${body}`;
}

/** A cost line: "-$1,514.04". Zero prints as "$0". */
export function cost(value: number): string {
  return value > 0 ? `-${money(value)}` : money(0);
}

/** Dollars per mile, always two decimals: "$1.87". Truncation is the caller's call. */
export function perMile(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe < 0 ? "-" : ""}$${cents.format(Math.abs(safe))}`;
}

export function miles(value: number): string {
  return `${whole.format(Math.round(Number.isFinite(value) ? value : 0))} mi`;
}

export function pct(value: number, digits = 1): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toFixed(digits)}%`;
}

export function pounds(value: number): string {
  return `${whole.format(Math.round(value))} lb`;
}
