import type { EquipmentType, Load, LoadCapacity } from "./types";
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

type RoutePart = Pick<Load, "originCity" | "originState" | "destinationCity" | "destinationState" | "roundTrip">;

/** "Glendale, AZ → Chicago, IL", or "… → Glendale, AZ" again when the load comes back loaded. */
export function loadRoute(load: RoutePart, separator = " → "): string {
  const origin = `${load.originCity}, ${load.originState}`;
  const stops = [origin, `${load.destinationCity}, ${load.destinationState}`];
  if (load.roundTrip) stops.push(origin);
  return stops.join(separator);
}

/** "AZ-IL", or "AZ-IL-AZ" for a round trip. */
export function loadStateRoute(load: RoutePart): string {
  return [load.originState, load.destinationState, ...(load.roundTrip ? [load.originState] : [])].join("-");
}
