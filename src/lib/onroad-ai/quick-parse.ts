/**
 * QUICK PARSE -- the free, instant path
 * =====================================
 *
 * Most drivers type loads the same way: "Chicago IL Miami FL 1400 miles
 * $2800 120 DH". Reading that does not need a language model, costs nothing,
 * answers in milliseconds and cannot hallucinate. This parser handles the
 * shorthand and the fixed commands; anything it is not sure about returns
 * null and goes to the AI interpreter instead.
 *
 * Rules it keeps:
 *   - a number is only miles when it says so (mi / miles / millas)
 *   - a number is only deadhead when it says so (DH / deadhead / empty / vacío)
 *   - a number is only the rate when it has a $ (or "rate"/"pays"/"ofrecen")
 *   - deadhead after delivery only with an explicit word for it
 */

import type { LoadEquipment, LoadFacts, LoadKind, Place } from "./load-facts";
import { normalize, parseNumber } from "./settings";

export type QuickIntent =
  | { kind: "HELP" }
  | { kind: "GREETING" }
  | { kind: "SETTINGS_VIEW" }
  | { kind: "SETUP" }
  | { kind: "SAVE" }
  | { kind: "BROKER_MESSAGE" }
  | { kind: "WHAT_TO_ASK" }
  | { kind: "HISTORY" }
  | { kind: "RESET" }
  | { kind: "DELETE_DATA" }
  | { kind: "SEARCH"; text: string }
  | { kind: "COMPARE"; picks: number[] }
  | { kind: "PLAN" }
  | { kind: "UPGRADE" }
  | { kind: "MANAGE_PLAN" }
  | { kind: "SUMMARY" }
  | { kind: "ALERTS_LIST" }
  | { kind: "ALERT_STOP"; index: number }
  | { kind: "ALERTS_STOP_ALL" }
  | { kind: "ALERT_CREATE"; text: string }
  | { kind: "OFFER"; grossRate: number }
  | { kind: "LOAD_UPDATE"; facts: Partial<LoadFacts> }
  | { kind: "LOAD"; facts: Partial<LoadFacts> };

const STATES = new Set(
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY AB BC MB NB NL NS ON PE QC SK".split(" "),
);

const COMMANDS: { kind: Exclude<QuickIntent["kind"], "SEARCH" | "OFFER" | "LOAD" | "LOAD_UPDATE" | "COMPARE" | "ALERT_STOP" | "ALERT_CREATE">; pattern: RegExp }[] = [
  { kind: "PLAN", pattern: /^(plan|my plan|mi plan|billing|subscription|my subscription|suscripcion|mi suscripcion|facturacion)$/ },
  { kind: "UPGRADE", pattern: /^(upgrade|go pro|pro|subscribe|suscribirme|suscribir|mejorar|mejorar plan|plan pro|quiero pro)$/ },
  { kind: "MANAGE_PLAN", pattern: /^(manage subscription|manage billing|cancel subscription|update card|cancelar suscripcion|administrar suscripcion|cambiar tarjeta)$/ },
  { kind: "SUMMARY", pattern: /^(summary|stats|my stats|my numbers|report|resumen|mi resumen|estadisticas|mis numeros|reporte)$/ },
  { kind: "ALERTS_LIST", pattern: /^(alerts|my alerts|list alerts|alertas|mis alertas|ver alertas)$/ },
  { kind: "ALERTS_STOP_ALL", pattern: /^(stop|stop alerts|stop all alerts|unsubscribe|parar|parar alertas|cancelar alertas|baja|detener alertas|no mas alertas)$/ },
  { kind: "HELP", pattern: /^(help|ayuda|menu|commands|comandos|\?)$/ },
  { kind: "GREETING", pattern: /^(hi|hello|hey|hola|buenas|buenos dias|buenas tardes|buenas noches|start|inicio|empezar)$/ },
  { kind: "SETTINGS_VIEW", pattern: /^(settings|setting|ajustes|perfil|profile|config|configuracion|my settings|mis ajustes)$/ },
  { kind: "SETUP", pattern: /^(setup|set up|configurar|onboarding|restart setup)$/ },
  { kind: "SAVE", pattern: /^(save|save it|save load|guardar|guardala|guardar carga|guarda)$/ },
  {
    kind: "BROKER_MESSAGE",
    pattern: /(broker message|message (to|for) (the )?broker|write (a |the )?(message|text|email) (to|for) (the )?broker|mensaje (al|para el|pal) broker|escribe(le)? al broker|texto (al|para el) broker)/,
  },
  {
    kind: "WHAT_TO_ASK",
    pattern: /(what (should|do|can) i (offer|ask|quote|counter|charge)|what to ask|lowest (i should|to) (take|accept)|minimum (i should|to) (take|accept)|counter ?offer|que (pido|ofrezco|cobro|contraoferta)|cuanto (pido|cobro|ofrezco)|lo minimo que (acepto|debo aceptar|puedo aceptar)|contraoferta)/,
  },
  { kind: "HISTORY", pattern: /^(history|historial|my loads|mis cargas|saved|guardadas|loads)$/ },
  { kind: "RESET", pattern: /^(reset|new load|nueva carga|cancel|cancelar|clear|borrar carga)$/ },
  { kind: "DELETE_DATA", pattern: /(delete my (data|account|info)|erase my data|borrar mis datos|borra mis datos|eliminar mi cuenta|borrar mi cuenta|eliminar mis datos)/ },
];

const NUM = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)`;

function grossRateOf(clean: string): number | null {
  const dollar = clean.match(new RegExp(String.raw`\$\s*${NUM}\s*(k)?\b`));
  if (dollar) {
    const value = parseNumber(dollar[1]);
    return value === null ? null : dollar[2] ? value * 1000 : value;
  }
  const worded = clean.match(
    new RegExp(String.raw`(?:rate|pays?|paying|offer(?:ed|s|ing)?|ofrece(?:n)?|ofrecio|ofrecieron|pagan|paga|tarifa)\s*(?:is|of|de|es)?\s*:?\s*${NUM}\s*(k)?\b`),
  );
  if (worded) {
    const value = parseNumber(worded[1]);
    return value === null ? null : worded[2] ? value * 1000 : value;
  }
  const usd = clean.match(new RegExp(String.raw`${NUM}\s*(?:usd|dollars|dolares|dlls)\b`));
  return usd ? parseNumber(usd[1]) : null;
}

const DH_AFTER = String.raw`(?:dh after|dead[ -]?head after|dh back|dh home|return(?:ing)?(?: home)?|back home|empty back|de regreso|regreso|vacio despues|vacias despues)`;
const DH = String.raw`(?:dh-?o|dh|dead[ -]?head|empty|vacio|vacias|vacios|en vacio)`;

/** Explicit mileage corrections, not an entire new load or an unlabelled answer. */
export function parseDeadheadUpdate(text: string): Partial<LoadFacts> | null {
  const clean = normalize(text);
  const unit = String.raw`(?:mi(?:les?)?|millas?|mls)`;
  const read = (label: string): number | null => {
    const match = clean.match(new RegExp(String.raw`^${label}\s*[:=]?\s*${NUM}(?:\s*${unit})?\.?$`)) ??
      clean.match(new RegExp(String.raw`^${NUM}\s*(?:${unit}\s*)?${label}\.?$`));
    const value = match ? parseNumber(match[1]) : null;
    return value !== null && value <= 10_000 ? value : null;
  };
  const after = read(DH_AFTER);
  if (after !== null) return { deadheadAfterMiles: after };
  const pickup = read(DH);
  return pickup !== null ? { deadheadPickupMiles: pickup } : null;
}

function milesOf(clean: string) {
  let rest = clean;
  const take = (pattern: RegExp): number | null => {
    const match = rest.match(pattern);
    if (!match) return null;
    rest = rest.replace(match[0], " ");
    return parseNumber(match[1]);
  };
  const deadheadAfterMiles =
    take(new RegExp(String.raw`${NUM}\s*(?:mi(?:les)?|millas)?\s*${DH_AFTER}\b`)) ??
    take(new RegExp(String.raw`${DH_AFTER}\s*:?\s*${NUM}`));
  const deadheadPickupMiles =
    take(new RegExp(String.raw`${NUM}\s*(?:mi(?:les)?|millas)?\s*${DH}\b`)) ??
    take(new RegExp(String.raw`\b${DH}\s*:?\s*${NUM}`));
  const loadedMiles =
    take(new RegExp(String.raw`(?:loaded|cargadas|trip)\s*:?\s*${NUM}`)) ??
    take(new RegExp(String.raw`${NUM}\s*(?:mi|miles|mile|millas|mls)\b`));
  return { loadedMiles, deadheadPickupMiles, deadheadAfterMiles };
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function placeFrom(tokens: string[]): Place | null {
  if (!tokens.length) return null;
  const last = tokens[tokens.length - 1].toUpperCase();
  if (STATES.has(last)) {
    const city = tokens.slice(0, -1).join(" ").replace(/,$/, "").trim();
    return { city: city ? titleCase(city) : null, state: last };
  }
  return null;
}

/** Origin and destination from the text before the first number. */
function laneOf(original: string): { origin: Place | null; destination: Place | null } {
  const firstNumber = original.search(/[$\d]/);
  const head = (firstNumber === -1 ? original : original.slice(0, firstNumber))
    .replace(/^\s*(from|de|desde)\s+/i, "")
    .replace(/[,]/g, " ")
    .trim();
  if (!head) return { origin: null, destination: null };

  const split = head.split(/\s*(?:→|->|>|–|—| - | to | a | hasta | hacia )\s*/i).filter(Boolean);
  if (split.length === 2) {
    return {
      origin: placeFrom(split[0].split(/\s+/)),
      destination: placeFrom(split[1].split(/\s+/)),
    };
  }
  const tokens = head.split(/\s+/);
  const codes = tokens.map((token, index) => (STATES.has(token.toUpperCase()) && index > 0 ? index : -1)).filter((index) => index >= 0);
  if (codes.length !== 2) return { origin: null, destination: null };
  return {
    origin: placeFrom(tokens.slice(0, codes[0] + 1)),
    destination: placeFrom(tokens.slice(codes[0] + 1, codes[1] + 1)),
  };
}

function equipmentOf(clean: string): { equipment: LoadEquipment | null; equipmentLengthFt: number | null } {
  const length = clean.match(/\b(\d{2})\s*(?:ft|feet|'|pies)\b/);
  const equipmentLengthFt = length ? Number(length[1]) : null;
  const checks: [LoadEquipment, RegExp][] = [
    ["REEFER_BOX", /\b(reefer|refrigerad[oa]) (box|straight)|box truck reefer/],
    ["BOX_TRUCK", /\b(box truck|straight truck|box|camion de caja)\b/],
    ["CARGO_VAN", /\b(cargo van|sprinter|van de carga)\b/],
    ["HOTSHOT", /\b(hot ?shot)\b/],
    ["FLATBED", /\b(flat ?bed|plataforma)\b/],
    ["REEFER", /\b(reefer|refrigerado)\b/],
    ["DRY_VAN", /\b(dry van|53 ?(ft|')? van|caja seca)\b/],
    ["POWER_ONLY", /\b(power only)\b/],
  ];
  const found = checks.find(([, pattern]) => pattern.test(clean));
  return { equipment: found ? found[0] : null, equipmentLengthFt };
}

function kindOf(clean: string): LoadKind | null {
  if (/\b(round ?trip|viaje redondo|ida y vuelta)\b/.test(clean)) return "ROUND_TRIP";
  if (/\b(partial|ltl|parcial)\b/.test(clean)) return "PARTIAL";
  if (/\b(dedicated|dedicad[oa])\b/.test(clean)) return "DEDICATED";
  if (/\b(full|ftl|completa)\b/.test(clean)) return "FULL";
  return null;
}

/** Parse a load out of a shorthand message. Null when it is not clearly one. */
export function parseLoadShorthand(text: string): Partial<LoadFacts> | null {
  const clean = normalize(text);
  const { loadedMiles, deadheadPickupMiles, deadheadAfterMiles } = milesOf(clean);
  const grossRate = grossRateOf(clean);
  const lane = laneOf(text);
  if (loadedMiles === null) return null;
  if (grossRate === null && deadheadPickupMiles === null && !lane.origin) return null;

  const weight = clean.match(new RegExp(String.raw`${NUM}\s*(?:lbs?|pounds|libras)\b`));
  const tolls = clean.match(new RegExp(String.raw`(?:tolls?|peajes?)\s*:?\s*\$?\s*${NUM}`));
  const stops = clean.match(/\b(\d)\s*(?:extra\s*)?(?:stops|paradas)\b/);
  return {
    ...lane,
    loadedMiles,
    deadheadPickupMiles,
    deadheadAfterMiles,
    grossRate,
    ...equipmentOf(clean),
    loadKind: kindOf(clean),
    weightLbs: weight ? parseNumber(weight[1]) : null,
    tolls: tolls ? parseNumber(tolls[1]) : null,
    extraStops: stops ? Number(stops[1]) : null,
    liftgateRequired: /\b(liftgate|lift gate)\b/.test(clean) ? true : null,
    palletJackRequired: /\b(pallet jack|patin)\b/.test(clean) ? true : null,
    source: "TEXT",
  };
}

/** "Broker offered $1700, should I take it?" -- a new offer for the current load. */
export function parseOffer(text: string): number | null {
  const clean = normalize(text);
  if (/\b(mi|miles|millas|dh|deadhead)\b/.test(clean)) return null;
  // A bare number ("1700") is only an offer when the bot just asked for the
  // rate; the router handles that case with the conversation state.
  return grossRateOf(clean);
}

/** A reply that is only a number: "120", "$2,800", "0". */
export function parseBareNumber(text: string): number | null {
  const clean = normalize(text).replace(/\s*(mi|miles|millas|dh|usd|dollars|dolares)\.?$/, "");
  const match = clean.match(new RegExp(String.raw`^\$?\s*${NUM}\s*(k)?$`));
  if (!match) return null;
  const value = parseNumber(match[1]);
  return value === null ? null : match[2] ? value * 1000 : value;
}

export function quickIntent(text: string): QuickIntent | null {
  const clean = normalize(text);
  for (const command of COMMANDS) {
    if (command.pattern.test(clean)) return { kind: command.kind };
  }
  const compare = clean.match(/^(?:compare|comparar|compara)\b(.*)$/);
  if (compare) {
    const picks = (compare[1].match(/\d{1,2}/g) ?? []).map(Number).slice(0, 3);
    return { kind: "COMPARE", picks };
  }
  const stop = clean.match(/^(?:stop|cancel|delete|remove|borrar|borra|parar|para|cancelar|quitar|detener)\s+(?:alert|alerta)\s*#?\s*(\d{1,2})$/);
  if (stop) return { kind: "ALERT_STOP", index: Number(stop[1]) };
  if (/^(alert me|alert|notify me|notify|let me know|tell me when|text me when|avisame|alertame|notificame|mandame una alerta|aviso)\b/.test(clean)) {
    return { kind: "ALERT_CREATE", text };
  }
  if (/^(find|search|look for|show me|any|busca|buscar|buscame|encuentra|encuentrame|hay)\b.*\b(loads?|cargas?|freight)\b/.test(clean)) {
    return { kind: "SEARCH", text };
  }
  const update = parseDeadheadUpdate(text);
  if (update) return { kind: "LOAD_UPDATE", facts: update };
  const facts = parseLoadShorthand(text);
  if (facts) return { kind: "LOAD", facts };
  const offer = parseOffer(text);
  if (offer !== null) return { kind: "OFFER", grossRate: offer };
  return null;
}
