/**
 * Maintenance domain.
 *
 * A maintenance item is due on a DATE, on MILEAGE, or on whichever comes
 * first (BOTH). The status calculation is the same for every type -- only
 * the interval defaults and the wording ("due" vs "renews") differ.
 */

import type {
  DueStatus,
  FinancialSettings,
  MaintenanceBasis,
  MaintenanceDue,
  MaintenanceRecord,
  MaintenanceType,
  Truck,
} from "./types";
import type { AppLocale } from "./i18n";

export interface MaintenanceTypeDefinition {
  id: MaintenanceType;
  label: string;
  labelEs: string;
  /** What this item is naturally measured against. */
  defaultBasis: MaintenanceBasis;
  /** Suggested interval in miles, used to prefill the next-service field. */
  intervalMiles: number | null;
  /** Suggested interval in months. */
  intervalMonths: number | null;
  /** Renewals read "Renews in 42 days"; services read "Due in 23 days". */
  renewal?: boolean;
}

export const MAINTENANCE_TYPES: MaintenanceTypeDefinition[] = [
  { id: "OIL_CHANGE", label: "Oil Change", labelEs: "Cambio de aceite", defaultBasis: "BOTH", intervalMiles: 15000, intervalMonths: 6 },
  { id: "OIL_FILTER", label: "Oil Filter", labelEs: "Filtro de aceite", defaultBasis: "MILEAGE", intervalMiles: 15000, intervalMonths: 6 },
  { id: "FUEL_FILTER", label: "Fuel Filter", labelEs: "Filtro de combustible", defaultBasis: "MILEAGE", intervalMiles: 30000, intervalMonths: 12 },
  { id: "TIRES", label: "Tires", labelEs: "Neumáticos", defaultBasis: "MILEAGE", intervalMiles: 60000, intervalMonths: null },
  { id: "BRAKES", label: "Brakes", labelEs: "Frenos", defaultBasis: "MILEAGE", intervalMiles: 50000, intervalMonths: null },
  { id: "TRANSMISSION", label: "Transmission", labelEs: "Transmisión", defaultBasis: "MILEAGE", intervalMiles: 100000, intervalMonths: null },
  { id: "COOLANT", label: "Coolant", labelEs: "Refrigerante", defaultBasis: "BOTH", intervalMiles: 100000, intervalMonths: 24 },
  { id: "BATTERY", label: "Battery", labelEs: "Batería", defaultBasis: "DATE", intervalMiles: null, intervalMonths: 36 },
  { id: "DOT_INSPECTION", label: "DOT Inspection", labelEs: "Inspección DOT", defaultBasis: "DATE", intervalMiles: null, intervalMonths: 12 },
  { id: "STATE_INSPECTION", label: "State Inspection", labelEs: "Inspección estatal", defaultBasis: "DATE", intervalMiles: null, intervalMonths: 12 },
  { id: "REGISTRATION", label: "Registration", labelEs: "Registro", defaultBasis: "DATE", intervalMiles: null, intervalMonths: 12, renewal: true },
  { id: "INSURANCE", label: "Insurance", labelEs: "Seguro", defaultBasis: "DATE", intervalMiles: null, intervalMonths: 12, renewal: true },
  { id: "OTHER", label: "Other", labelEs: "Otro", defaultBasis: "DATE", intervalMiles: null, intervalMonths: null },
];

const BY_ID = new Map(MAINTENANCE_TYPES.map((t) => [t.id, t]));

export const MAINTENANCE_TYPE_IDS = MAINTENANCE_TYPES.map((t) => t.id);

export function maintenanceType(id: string): MaintenanceTypeDefinition {
  return BY_ID.get(id as MaintenanceType) ?? BY_ID.get("OTHER")!;
}

export function maintenanceLabel(id: string, locale: AppLocale = "en"): string {
  const definition = maintenanceType(id);
  return locale === "es" ? definition.labelEs : definition.label;
}

function daysBetween(fromISO: string, toISO: string): number {
  const from = Date.parse(`${fromISO}T00:00:00Z`);
  const to = Date.parse(`${toISO}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

/** Adds whole months to an ISO date, clamping to the end of short months. */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map((v) => Number.parseInt(v, 10));
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

function worst(a: DueStatus, b: DueStatus): DueStatus {
  const rank: Record<DueStatus, number> = { UNSCHEDULED: 0, OK: 1, DUE_SOON: 2, OVERDUE: 3 };
  return rank[a] >= rank[b] ? a : b;
}

export interface DueThresholds {
  warnMiles: number;
  warnDays: number;
}

export function thresholdsFrom(settings: FinancialSettings): DueThresholds {
  return {
    // ?? not ||: 0 means "only warn me once it is actually overdue".
    warnMiles: settings.maintenanceWarnMiles ?? 2000,
    warnDays: settings.maintenanceWarnDays ?? 30,
  };
}

/**
 * Turns one record into its due state. Mileage uses the truck's current
 * odometer; dates use today. When basis is BOTH, whichever is worse wins --
 * a truck that is 400 miles from an oil change is due even if the date is
 * still months away.
 */
export function computeDue(
  record: MaintenanceRecord,
  currentOdometer: number,
  today: string,
  thresholds: DueThresholds,
  locale: AppLocale = "en",
): MaintenanceDue {
  const definition = maintenanceType(record.type);
  const usesMileage = record.basis !== "DATE" && record.nextServiceOdometer != null;
  const usesDate = record.basis !== "MILEAGE" && record.nextServiceDate != null;

  const milesRemaining = usesMileage ? record.nextServiceOdometer! - currentOdometer : null;
  const daysRemaining = usesDate ? daysBetween(today, record.nextServiceDate!) : null;

  let status: DueStatus = usesMileage || usesDate ? "OK" : "UNSCHEDULED";

  if (milesRemaining !== null) {
    status = worst(
      status,
      milesRemaining < 0 ? "OVERDUE" : milesRemaining <= thresholds.warnMiles ? "DUE_SOON" : "OK",
    );
  }
  if (daysRemaining !== null) {
    status = worst(
      status,
      daysRemaining < 0 ? "OVERDUE" : daysRemaining <= thresholds.warnDays ? "DUE_SOON" : "OK",
    );
  }

  return {
    record,
    type: record.type,
    label: locale === "es" ? definition.labelEs : definition.label,
    status,
    milesRemaining,
    daysRemaining,
    urgency: urgencyOf(milesRemaining, daysRemaining, thresholds),
    summary: summarize(definition, status, milesRemaining, daysRemaining, thresholds, locale),
  };
}

/**
 * How close an item is to being due, as a multiple of the user's own warning
 * threshold: 1.0 means exactly at the warning point, 0 means due now.
 *
 * Expressing miles and days in the same unit is the only way to compare them.
 * An arbitrary miles-per-day constant cannot do it, because the thresholds
 * are what define "soon" for each measure.
 */
function urgencyOf(
  milesRemaining: number | null,
  daysRemaining: number | null,
  thresholds: DueThresholds,
): number {
  const parts: number[] = [];
  if (milesRemaining !== null) {
    parts.push(thresholds.warnMiles > 0 ? milesRemaining / thresholds.warnMiles : milesRemaining);
  }
  if (daysRemaining !== null) {
    parts.push(thresholds.warnDays > 0 ? daysRemaining / thresholds.warnDays : daysRemaining);
  }
  return parts.length ? Math.min(...parts) : Number.MAX_SAFE_INTEGER;
}

function summarize(
  definition: MaintenanceTypeDefinition,
  status: DueStatus,
  milesRemaining: number | null,
  daysRemaining: number | null,
  thresholds: DueThresholds,
  locale: AppLocale,
): string {
  if (status === "UNSCHEDULED") return locale === "es" ? "Sin próximo servicio programado" : "No next service scheduled";

  const verb = locale === "es" ? (definition.renewal ? "Renueva" : "Vence") : definition.renewal ? "Renews" : "Due";
  const numberFmt = new Intl.NumberFormat(locale === "es" ? "es-US" : "en-US");

  if (status === "OVERDUE") {
    // Report whichever measure has actually run out; if both have, lead with
    // the one that is further past due.
    const overMiles = milesRemaining !== null && milesRemaining < 0 ? -milesRemaining : null;
    const overDays = daysRemaining !== null && daysRemaining < 0 ? -daysRemaining : null;
    const preferMiles =
      overMiles !== null &&
      (overDays === null ||
        (thresholds.warnMiles > 0 ? overMiles / thresholds.warnMiles : overMiles) >=
          (thresholds.warnDays > 0 ? overDays / thresholds.warnDays : overDays));

    if (preferMiles) return locale === "es" ? `Vencido por ${numberFmt.format(overMiles!)} millas` : `Overdue by ${numberFmt.format(overMiles!)} miles`;
    if (overDays !== null) {
      return locale === "es" ? `Vencido por ${overDays} ${overDays === 1 ? "día" : "días"}` : `Overdue by ${overDays} ${overDays === 1 ? "day" : "days"}`;
    }
    return locale === "es" ? "Vencido" : "Overdue";
  }

  // Lead with whichever measure is closer to running out, scored against the
  // user's own thresholds rather than an invented miles-per-day rate.
  const parts: { text: string; urgency: number }[] = [];
  if (milesRemaining !== null) {
    parts.push({
      text: locale === "es" ? `${verb} en ${numberFmt.format(milesRemaining)} millas` : `${verb} in ${numberFmt.format(milesRemaining)} miles`,
      urgency: thresholds.warnMiles > 0 ? milesRemaining / thresholds.warnMiles : milesRemaining,
    });
  }
  if (daysRemaining !== null) {
    parts.push({
      text: locale === "es" ? `${verb} en ${daysRemaining} ${daysRemaining === 1 ? "día" : "días"}` : `${verb} in ${daysRemaining} ${daysRemaining === 1 ? "day" : "days"}`,
      urgency: thresholds.warnDays > 0 ? daysRemaining / thresholds.warnDays : daysRemaining,
    });
  }
  parts.sort((a, b) => a.urgency - b.urgency);
  return parts[0]?.text ?? (locale === "es" ? "Programado" : "Scheduled");
}

/**
 * The upcoming list: the most recent record of each type, with a next
 * service set, ordered most urgent first.
 */
export function upcomingMaintenance(
  records: MaintenanceRecord[],
  truck: Truck,
  today: string,
  thresholds: DueThresholds,
  locale: AppLocale = "en",
): MaintenanceDue[] {
  const latestByType = new Map<string, MaintenanceRecord>();
  for (const record of records) {
    if (record.truckId !== truck.id) continue;
    const existing = latestByType.get(record.type);
    if (!existing) {
      latestByType.set(record.type, record);
      continue;
    }
    // A newer record wins, except that a record with a next service still
    // scheduled must never be hidden behind one that schedules nothing --
    // otherwise logging a service without an interval silently drops the
    // item off the due list entirely.
    const scheduled = hasSchedule(record);
    const existingScheduled = hasSchedule(existing);
    if (scheduled !== existingScheduled) {
      if (scheduled) latestByType.set(record.type, record);
      continue;
    }
    if (
      record.serviceDate > existing.serviceDate ||
      (record.serviceDate === existing.serviceDate && record.id > existing.id)
    ) {
      latestByType.set(record.type, record);
    }
  }

  const rank: Record<DueStatus, number> = { OVERDUE: 0, DUE_SOON: 1, OK: 2, UNSCHEDULED: 3 };

  return [...latestByType.values()]
    .map((record) => computeDue(record, truck.currentOdometer, today, thresholds, locale))
    .filter((due) => due.status !== "UNSCHEDULED")
    .sort((a, b) => {
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      return a.urgency - b.urgency;
    });
}

function hasSchedule(record: MaintenanceRecord): boolean {
  return (
    (record.basis !== "MILEAGE" && record.nextServiceDate != null) ||
    (record.basis !== "DATE" && record.nextServiceOdometer != null)
  );
}

/** Suggested next service values, used to prefill the maintenance form. */
export function suggestNextService(
  type: MaintenanceType,
  serviceDate: string,
  odometer: number | null,
): { nextServiceDate: string | null; nextServiceOdometer: number | null; basis: MaintenanceBasis } {
  const definition = maintenanceType(type);
  return {
    basis: definition.defaultBasis,
    nextServiceDate: definition.intervalMonths ? addMonths(serviceDate, definition.intervalMonths) : null,
    // `odometer != null`, not a truthiness test: 0 is a real reading on a
    // brand new truck and must still produce an interval.
    nextServiceOdometer:
      definition.intervalMiles && odometer != null ? odometer + definition.intervalMiles : null,
  };
}
