import type { AppLocale } from "@/lib/i18n";
import { getWebDictionary, interpolate } from "@/lib/i18n/dictionaries";
import type { Period } from "@/lib/periods";

export function localeTag(locale: AppLocale): "en-US" | "es-US" {
  return locale === "es" ? "es-US" : "en-US";
}

export function formatLocaleDate(
  value: string | Date,
  locale: AppLocale,
  options: Intl.DateTimeFormatOptions | "short" | "medium" | "long" = { month: "short", day: "numeric", year: "numeric" },
): string {
  const date = value instanceof Date
    ? value
    : new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(date.getTime())) return "—";
  const resolved = typeof options === "string"
    ? options === "short"
      ? { month: "short" as const, day: "numeric" as const }
      : options === "medium"
        ? { month: "short" as const, day: "numeric" as const, year: "numeric" as const }
        : { month: "long" as const, day: "numeric" as const, year: "numeric" as const }
    : options;
  return new Intl.DateTimeFormat(localeTag(locale), { timeZone: "UTC", ...resolved }).format(date);
}

export function formatLocaleNumber(
  value: number,
  locale: AppLocale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(localeTag(locale), options).format(value);
}

/** Localize a resolved period instead of leaking the English labels stored by the finance model. */
export function formatLocalePeriod(
  period: Period,
  locale: AppLocale,
  style: "long" | "short" = "long",
): string {
  const copy = getWebDictionary(locale).common;
  const month = formatLocaleDate(`${period.month}-01`, locale, {
    month: style === "short" ? "short" : "long",
    ...(style === "long" ? { year: "numeric" as const } : {}),
  });
  const day = (value: string) =>
    formatLocaleDate(value, locale, { month: "short", day: "numeric" });
  const year = period.month.slice(0, 4);

  switch (period.key) {
    case "today":
      return style === "short"
        ? copy.today
        : `${copy.today}, ${day(period.start)}`;
    case "week":
      return style === "short"
        ? copy.thisWeek
        : `${copy.thisWeek} · ${day(period.start)} ${copy.rangeConnector} ${day(period.end)}`;
    case "first":
      return `${month} 1–15`;
    case "second":
      return `${month} 16–${period.end.slice(-2).replace(/^0/, "")}`;
    case "quarter": {
      const quarter = Math.floor((Number(period.month.slice(5, 7)) - 1) / 3) + 1;
      return interpolate(copy.quarterLabel, { quarter, year });
    }
    case "ytd":
      return interpolate(style === "short" ? copy.ytdShort : copy.ytdLong, { year });
    case "custom":
      return `${day(period.start)}–${day(period.end)}`;
    case "full":
    default:
      return month;
  }
}
