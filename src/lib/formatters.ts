/**
 * Display formatting. Rule of the product: never show fake precision.
 *  - money  -> $1,245.50 (cents dropped when the value is whole and large)
 *  - miles  -> 2,450 mi
 *  - rates  -> $2.41/mi
 */

const usd = (min: number, max: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });

const money2 = usd(2, 2);
const money0 = usd(0, 0);
const numberFmt = new Intl.NumberFormat("en-US");

export function formatMoney(value: number | null | undefined): string {
  const n = safe(value);
  return money2.format(n);
}

/** Compact money for KPI headlines: drops cents when they are all zeros. */
export function formatMoneyCompact(value: number | null | undefined): string {
  const n = safe(value);
  return Number.isInteger(n) ? money0.format(n) : money2.format(n);
}

export function formatSignedMoney(value: number | null | undefined): string {
  const n = safe(value);
  const formatted = formatMoney(Math.abs(n));
  if (n < 0) return `-${formatted}`;
  return formatted;
}

export function formatMiles(value: number | null | undefined): string {
  return `${numberFmt.format(Math.round(safe(value)))} mi`;
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(safe(value));
}

export function formatRate(value: number | null | undefined): string {
  return `${usd(2, 2).format(safe(value))}/mi`;
}

/** Rate without the /mi suffix, for dense table cells. */
export function formatRateValue(value: number | null | undefined): string {
  return usd(2, 2).format(safe(value));
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  return `${safe(value).toFixed(digits)}%`;
}

export function formatGallons(value: number | null | undefined): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(safe(value))} gal`;
}

export function formatPricePerGallon(value: number | null | undefined): string {
  return `${usd(3, 3).format(safe(value))}/gal`;
}

export function formatOdometer(value: number | null | undefined): string {
  return numberFmt.format(Math.round(safe(value)));
}

/** "Aug 14" -- dense table dates. */
export function formatDateShort(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** "Nov 22, 2026" -- future dates, where the year matters. */
export function formatDateMedium(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "Fri, Aug 14, 2026" -- detail views. */
export function formatDateLong(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatRoute(
  originCity: string,
  originState: string,
  destinationCity: string,
  destinationState: string,
): string {
  return `${originCity}, ${originState} -> ${destinationCity}, ${destinationState}`;
}

export function formatDelta(value: number, digits = 1): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

function safe(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  // Normalise -0 (and anything that rounds to it) so nothing ever renders
  // as "-$0.00".
  return value === 0 ? 0 : value;
}
