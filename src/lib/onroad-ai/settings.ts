/**
 * PROFILE COMMANDS -- "mpg 9", "diesel 4.15", "dispatch 6%", "liftgate yes"
 * ========================================================================
 *
 * Deterministic. A settings change is a number the driver typed; it does not
 * need a language model to read it, and it must never be "interpreted" into
 * something else. English and Spanish keywords, accents optional.
 *
 * Every value goes through the profile schema's limits, so "mpg 85" is
 * refused with a reason instead of quietly pricing every load at 85 MPG.
 */

import type { FeeMode } from "../finance/load-calculator";
import { cleanState } from "../rate-con/schema";
import { driverProfileSchema, thresholdOrderError, type BotLocale, type DriverProfile, type TruckType } from "./profile";

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[¿?¡!]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "$4.15", "4,15" (Spanish decimal), "1,400", "1.8". */
export function parseNumber(raw: string): number | null {
  let value = raw.replace(/[$\s]/g, "");
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(value)) value = value.replace(/,/g, "");
  else if (/^\d+,\d{1,2}$/.test(value)) value = value.replace(",", ".");
  if (!/^\d*\.?\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const TRUCK_WORDS: { type: TruckType; pattern: RegExp }[] = [
  { type: "REEFER_BOX", pattern: /\b(reefer|refrigerad[oa]|refer)\s*(box|caja|straight)|\b(box|caja)\s*(truck)?\s*(reefer|refrigerad[oa])/ },
  { type: "BOX_TRUCK", pattern: /\b(box\s*truck|straight\s*(box|truck)|box|caja|camion de caja|bobtail)\b/ },
  { type: "CARGO_VAN", pattern: /\b(cargo\s*van|sprinter|van de carga|transit|promaster)\b/ },
  { type: "HOTSHOT", pattern: /\b(hot\s*shot|hotshot)\b/ },
  { type: "REEFER", pattern: /\b(reefer|refrigerado|refer)\b/ },
  { type: "FLATBED", pattern: /\b(flat\s*bed|flatbed|plataforma)\b/ },
  { type: "DRY_VAN", pattern: /\b(dry\s*van|53|semi|trailer|caja seca)\b/ },
];

/** "26 ft box truck", "box truck 24'", "sprinter", "camión de caja 26 pies". */
export function parseTruck(text: string): { truckType: TruckType; truckLengthFt: number | null } | null {
  const clean = normalize(text);
  const found = TRUCK_WORDS.find((item) => item.pattern.test(clean));
  if (!found) return null;
  const length = clean.match(/(\d{2})\s*(?:ft|feet|foot|pies|'|’)/) ?? clean.match(/\b(1[0-9]|2[0-9]|53)\b/);
  const lengthFt = length ? Number(length[1]) : null;
  const truckType = found.type === "DRY_VAN" && lengthFt !== null && lengthFt <= 28 ? "BOX_TRUCK" : found.type;
  return { truckType, truckLengthFt: lengthFt && lengthFt >= 8 && lengthFt <= 80 ? lengthFt : null };
}

export interface FeePair {
  dispatchMode: FeeMode;
  dispatchValue: number;
  factoringMode: FeeMode;
  factoringValue: number;
}

/** "5 3.5", "5% 3.5%", "dispatch 6 factoring 3", "0 0". Percentages only. */
export function parseFees(text: string): FeePair | null {
  const clean = normalize(text);
  const named = {
    dispatch: clean.match(/(?:dispatch|despacho)\s*:?\s*(\d+(?:[.,]\d+)?)/)?.[1],
    factoring: clean.match(/(?:factoring|factoraje)\s*:?\s*(\d+(?:[.,]\d+)?)/)?.[1],
  };
  let values: (string | undefined)[] = [named.dispatch, named.factoring];
  if (!named.dispatch || !named.factoring) {
    const numbers = clean.match(/\d+(?:[.,]\d+)?/g) ?? [];
    if (numbers.length !== 2) return null;
    values = numbers;
  }
  const dispatchValue = parseNumber(values[0] ?? "");
  const factoringValue = parseNumber(values[1] ?? "");
  if (dispatchValue === null || factoringValue === null || dispatchValue > 50 || factoringValue > 50) return null;
  return { dispatchMode: "PCT", dispatchValue, factoringMode: "PCT", factoringValue };
}

export function isAffirmative(text: string): boolean {
  return /^(ok|okay|okey|yes|y|si|s|sure|dale|listo|correcto|bien|use it|usar|👍)\.?$/.test(normalize(text));
}

export function isSkip(text: string): boolean {
  return /^(skip|saltar|omitir)$/.test(normalize(text));
}

export function languageCommand(text: string): BotLocale | null {
  const clean = normalize(text);
  if (/^(espanol|spanish|language es|idioma es|idioma espanol|en espanol)$/.test(clean)) return "es";
  if (/^(english|ingles|language en|idioma en|idioma ingles|in english)$/.test(clean)) return "en";
  return null;
}

type NumericKey =
  | "mpg"
  | "fuelPrice"
  | "maintenancePerMile"
  | "minRatePerTotalMile"
  | "ratingGreat"
  | "ratingGood"
  | "ratingMarginal"
  | "deadheadWarnPct"
  | "maxDeadheadMiles"
  | "maxMilesPerDay"
  | "cargoCapacityLbs"
  | "truckHeightFt"
  | "defaultTolls"
  | "defaultOtherCost";

const NUMERIC: { key: NumericKey; aliases: string[] }[] = [
  { key: "deadheadWarnPct", aliases: ["deadhead warn", "deadhead warning", "dh warn", "alerta vacio", "alerta de vacio", "alerta deadhead"] },
  { key: "maxDeadheadMiles", aliases: ["max deadhead", "max dh", "maximum deadhead", "max vacio", "maximo vacio", "maximo deadhead"] },
  { key: "maxMilesPerDay", aliases: ["miles per day", "miles a day", "millas por dia", "millas al dia"] },
  { key: "minRatePerTotalMile", aliases: ["minimum rpm", "min rpm", "minimum", "min", "floor", "minimo rpm", "minimo"] },
  { key: "maintenancePerMile", aliases: ["maintenance", "maint", "mantenimiento"] },
  { key: "fuelPrice", aliases: ["fuel price", "diesel price", "fuel", "diesel", "gas", "combustible", "precio diesel"] },
  { key: "mpg", aliases: ["mpg", "millas por galon"] },
  { key: "ratingGreat", aliases: ["great", "excelente"] },
  { key: "ratingGood", aliases: ["good", "buena", "bueno"] },
  { key: "ratingMarginal", aliases: ["marginal"] },
  { key: "cargoCapacityLbs", aliases: ["capacity", "payload", "capacidad", "carga maxima"] },
  { key: "truckHeightFt", aliases: ["height", "altura"] },
  { key: "defaultTolls", aliases: ["tolls", "toll", "peajes", "peaje"] },
  { key: "defaultOtherCost", aliases: ["other cost", "other costs", "otro costo", "otros costos"] },
];

const SEPARATOR = String.raw`\s*(?:=|:|to|a|en|es)?\s*`;
const VALUE = String.raw`(\$?\s*\d+(?:[.,]\d+)?)\s*(%|lbs?|libras|ft|pies|mi|millas)?`;

export type SettingsCommand =
  | { kind: "patch"; patch: Partial<DriverProfile>; keys: string[] }
  | { kind: "invalid"; key: string };

function escape(alias: string): string {
  return alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
}

/** Validate a candidate patch against the schema and the threshold order. */
function validated(profile: DriverProfile, patch: Partial<DriverProfile>, keys: string[]): SettingsCommand {
  const candidate = driverProfileSchema.safeParse({ ...profile, ...patch });
  if (!candidate.success) return { kind: "invalid", key: keys[0] };
  if (thresholdOrderError(candidate.data)) return { kind: "invalid", key: keys[0] };
  return { kind: "patch", patch, keys };
}

/**
 * Null when the message is not a settings command at all, so the router can
 * try it as a load. The whole message must be the command: "fuel 4.15"
 * changes diesel; "fuel was 4.15 on that load" does not.
 */
export function parseSettingsCommand(text: string, profile: DriverProfile): SettingsCommand | null {
  const clean = normalize(text).replace(/^(set|change|cambiar|cambia|pon|poner)\s+/, "");

  if (/^(clear|reset|borrar|quitar) (my )?(preferences|prefs|preferencias|mis preferencias)$/.test(clean)) {
    return { kind: "patch", patch: { preferredOrigins: [], preferredDestinations: [], preferredFreight: [] }, keys: ["preferences"] };
  }
  const lanes = [
    { key: "preferredOrigins", pattern: /^(?:prefer(?:red)?\s+)?(?:origins?|pickups?)(?:\s+states?)?\s*:?\s+(.+)$|^(?:origen(?:es)?|recogidas?)\s+preferid[oa]s?\s*:?\s+(.+)$|^prefiero\s+(?:origen|recoger en)\s+(.+)$/ },
    { key: "preferredDestinations", pattern: /^(?:prefer(?:red)?\s+)?(?:destinations?|drops?|deliveries)(?:\s+states?)?\s*:?\s+(.+)$|^(?:destinos?|entregas?)\s+preferid[oa]s?\s*:?\s+(.+)$|^prefiero\s+(?:destino|ir a|entregar en)\s+(.+)$/ },
  ] as const;
  for (const lane of lanes) {
    const match = clean.match(lane.pattern);
    if (!match) continue;
    const raw = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (/^(none|ninguno|ninguna|nada)$/.test(raw)) return { kind: "patch", patch: { [lane.key]: [] }, keys: [lane.key] };
    const tokens = raw.split(/[,/]+|\s+(?:and|y|&)\s+|\s+/).filter(Boolean);
    // Two-word names ("new york", "north carolina") before single codes.
    const states: string[] = [];
    for (let index = 0; index < tokens.length; index += 1) {
      const pair = index + 1 < tokens.length ? cleanState(`${tokens[index]} ${tokens[index + 1]}`) : null;
      const twoWord = pair && !/^[a-z]{2}$/.test(tokens[index]) ? pair : null;
      const state = twoWord ?? cleanState(tokens[index]);
      if (!state) return { kind: "invalid", key: lane.key };
      if (twoWord) index += 1;
      if (!states.includes(state)) states.push(state);
    }
    if (!states.length || states.length > 10) return { kind: "invalid", key: lane.key };
    return validated(profile, { [lane.key]: states }, [lane.key]);
  }
  const freight = clean.match(/^(?:prefer(?:red)?\s+)?freight\s*:?\s+(.+)$|^(?:carga|cargas|tipo de carga)\s+preferid[oa]s?\s*:?\s+(.+)$/);
  if (freight) {
    const items = (freight[1] ?? freight[2] ?? "").split(/\s*,\s*/).map((item) => item.trim()).filter(Boolean).slice(0, 10);
    if (!items.length) return { kind: "invalid", key: "preferredFreight" };
    return validated(profile, { preferredFreight: items }, ["preferredFreight"]);
  }

  const truck = clean.match(/^(?:truck|camion|equipo|equipment)\s*:?\s+(.+)$/);
  if (truck) {
    const parsed = parseTruck(truck[1]);
    if (!parsed) return { kind: "invalid", key: "truck" };
    return validated(profile, parsed, ["truck"]);
  }

  const toggle = clean.match(/^(liftgate|lift gate|pallet jack|palletjack|pallet)\s*:?\s*(yes|y|si|no|n|true|false)$/);
  if (toggle) {
    const key = toggle[1].startsWith("lift") ? "hasLiftgate" : "hasPalletJack";
    const value = /^(yes|y|si|true)$/.test(toggle[2]);
    return validated(profile, { [key]: value }, [key]);
  }

  for (const fee of [
    { aliases: ["dispatch", "despacho"], mode: "dispatchMode", value: "dispatchValue", name: "dispatch" },
    { aliases: ["factoring", "factoraje"], mode: "factoringMode", value: "factoringValue", name: "factoring" },
  ] as const) {
    const match = clean.match(new RegExp(`^(?:${fee.aliases.join("|")})${SEPARATOR}(\\$)?\\s*(\\d+(?:[.,]\\d+)?)\\s*(%)?$`));
    if (!match) continue;
    const amount = parseNumber(match[2]);
    if (amount === null) return { kind: "invalid", key: fee.name };
    const mode: FeeMode = match[1] === "$" ? "AMOUNT" : "PCT";
    if (mode === "PCT" && amount > 50) return { kind: "invalid", key: fee.name };
    return validated(profile, { [fee.mode]: mode, [fee.value]: amount }, [fee.name]);
  }

  for (const { key, aliases } of NUMERIC) {
    const match = clean.match(new RegExp(`^(?:${aliases.map(escape).join("|")})${SEPARATOR}${VALUE}$`));
    if (!match) continue;
    const value = parseNumber(match[1]);
    if (value === null) return { kind: "invalid", key };
    if (key === "minRatePerTotalMile" || key === "maxDeadheadMiles") {
      const patch = { [key]: key === "maxDeadheadMiles" && value === 0 ? null : value } as Partial<DriverProfile>;
      return validated(profile, patch, [key]);
    }
    return validated(profile, { [key]: value } as Partial<DriverProfile>, [key]);
  }
  return null;
}
