import type { EquipmentType, LoadCapacity } from "./types";

export const EQUIPMENT_TYPES: { id: EquipmentType; label: string }[] = [
  { id: "BOX_TRUCK", label: "Box truck" },
  { id: "DRY_VAN", label: "Dry van" },
  { id: "REEFER", label: "Reefer" },
  { id: "FLATBED", label: "Flatbed" },
  { id: "POWER_ONLY", label: "Power only" },
  { id: "SPRINTER_VAN", label: "Sprinter van" },
  { id: "OTHER", label: "Other" },
];

export const LOAD_CAPACITIES: { id: LoadCapacity; label: string }[] = [
  { id: "FULL", label: "Full load" },
  { id: "PARTIAL", label: "Partial" },
];

export function equipmentTypeLabel(value: EquipmentType | null | undefined): string {
  return EQUIPMENT_TYPES.find((option) => option.id === value)?.label ?? "Not specified";
}

export function loadCapacityLabel(value: LoadCapacity | null | undefined): string {
  return LOAD_CAPACITIES.find((option) => option.id === value)?.label ?? "Not specified";
}
