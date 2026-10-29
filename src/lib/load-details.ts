import type { EquipmentType, Load, LoadCapacity, LoadLeg } from "./types";
import type { AppLocale } from "./i18n";

export const EQUIPMENT_TYPES: { id: EquipmentType; label: string; labelEs: string }[] = [
  { id: "BOX_TRUCK", label: "Box truck", labelEs: "Camión de caja" },
  { id: "DRY_VAN", label: "Dry van", labelEs: "Caja seca" },
  { id: "REEFER", label: "Reefer", labelEs: "Refrigerado" },
  { id: "FLATBED", label: "Flatbed", labelEs: "Plataforma" },
  { id: "POWER_ONLY", label: "Power only", labelEs: "Solo tractor" },
  { id: "SPRINTER_VAN", label: "Sprinter van", labelEs: "Van Sprinter" },
  { id: "OTHER", label: "Other", labelEs: "Otro" },
];

export const LOAD_CAPACITIES: { id: LoadCapacity; label: string; labelEs: string }[] = [
  { id: "FULL", label: "Full load", labelEs: "Carga completa" },
  { id: "PARTIAL", label: "Partial", labelEs: "Parcial" },
];

export function equipmentTypeLabel(value: EquipmentType | null | undefined, locale: AppLocale = "en"): string {
  const option = EQUIPMENT_TYPES.find((item) => item.id === value);
  return option ? (locale === "es" ? option.labelEs : option.label) : locale === "es" ? "Sin especificar" : "Not specified";
}

export function loadCapacityLabel(value: LoadCapacity | null | undefined, locale: AppLocale = "en"): string {
  const option = LOAD_CAPACITIES.find((item) => item.id === value);
  return option ? (locale === "es" ? option.labelEs : option.label) : locale === "es" ? "Sin especificar" : "Not specified";
}

type RoutePart = Pick<Load, "originCity" | "originState" | "destinationCity" | "destinationState" | "extraLegs">;

function routeStops(load: RoutePart, place: (city: string, state: string) => string): string[] {
  const stops = [place(load.originCity, load.originState), place(load.destinationCity, load.destinationState)];
  for (const leg of load.extraLegs ?? []) {
    const from = place(leg.originCity, leg.originState);
    // A leg that starts where the last one ended reads as one chain.
    if (from !== stops[stops.length - 1]) stops.push(from);
    stops.push(place(leg.destinationCity, leg.destinationState));
  }
  return stops;
}

/** "Glendale, NY → Chicago, IL", then every extra leg: "… → Glendale, NY". */
export function loadRoute(load: RoutePart, separator = " → "): string {
  return routeStops(load, (city, state) => `${city}, ${state}`).join(separator);
}

/** "NY-IL", or "NY-IL-NY" with a leg back. */
export function loadStateRoute(load: RoutePart): string {
  return routeStops(load, (_city, state) => state).join("-");
}

/** Each leg with its own miles; the first leg gets whatever the extra legs do not cover. */
export function loadLegs(load: RoutePart & Pick<Load, "loadedMiles">): { route: string; miles: number }[] {
  const extra = load.extraLegs ?? [];
  const first = load.loadedMiles - extra.reduce((total, leg) => total + leg.miles, 0);
  return [
    { route: `${load.originCity}, ${load.originState} → ${load.destinationCity}, ${load.destinationState}`, miles: first },
    ...extra.map((leg) => ({ route: `${leg.originCity}, ${leg.originState} → ${leg.destinationCity}, ${leg.destinationState}`, miles: leg.miles })),
  ];
}

/** Reads stored legs defensively: anything malformed is dropped rather than trusted. */
export function normalizeExtraLegs(value: unknown): LoadLeg[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const leg = raw as Record<string, unknown>;
    const text = (key: string) => (typeof leg[key] === "string" ? (leg[key] as string) : "");
    if (!text("originCity") || !text("destinationCity")) return [];
    const miles = Number(leg.miles);
    return [{
      pickupDate: text("pickupDate"),
      deliveryDate: text("deliveryDate") || null,
      originCity: text("originCity"),
      originState: text("originState").toUpperCase(),
      destinationCity: text("destinationCity"),
      destinationState: text("destinationState").toUpperCase(),
      miles: Number.isFinite(miles) && miles > 0 ? Math.round(miles) : 0,
    }];
  });
}
