import type { Dataset, Expense, ExpenseScope, Load, Truck } from "./types";

/**
 * Reading a fleet.
 *
 * These are the small, boring accessors that everything else builds on. They
 * exist so that "which truck" is answered in one place rather than by every
 * page reaching into `dataset.trucks[0]` and quietly disagreeing about what
 * happens when a unit is archived.
 */

/**
 * The unit a single-truck business means when it says "the truck".
 *
 * Prefers an active one, because deactivating the only truck must not take
 * the whole app down -- the same rule the Postgres store already followed.
 */
export function primaryTruck(trucks: Truck[]): Truck {
  return trucks.find((t) => t.active) ?? trucks[0];
}

export function activeTrucks(trucks: Truck[]): Truck[] {
  return trucks.filter((t) => t.active);
}

export function truckById(trucks: Truck[], id: string | null | undefined): Truck | undefined {
  if (!id) return undefined;
  return trucks.find((t) => t.id === id);
}

/**
 * Resolves an optional unit id without silently accepting a forged or stale
 * id. Omitting the id only means "the truck" when there is one active answer.
 * Once a fleet has multiple active units, guessing would quietly post money
 * and mileage to whichever truck happens to sort first.
 */
export function resolveTruckId(
  trucks: Pick<Truck, "id" | "active">[],
  requested: string | null | undefined,
): string {
  const wanted = requested?.trim();
  if (!wanted) {
    const active = trucks.filter((truck) => truck.active);
    if (active.length > 1) {
      throw new Error("Choose which truck this record belongs to.");
    }
    const onlyAnswer = active[0] ?? (trucks.length === 1 ? trucks[0] : undefined);
    if (!onlyAnswer) throw new Error("This workspace has no active truck.");
    return onlyAnswer.id;
  }
  if (trucks.some((truck) => truck.id === wanted)) return wanted;
  throw new Error("That truck does not belong to this workspace.");
}

/** A load-linked cost must belong to the same unit that ran the load. */
export function assertLoadTruckLink(
  loads: Pick<Load, "id" | "truckId">[],
  loadId: string | null | undefined,
  truckId: string | null,
  scope: ExpenseScope = "TRUCK",
): void {
  const linkedId = loadId?.trim();
  if (!linkedId) return;
  const load = loads.find((candidate) => candidate.id === linkedId);
  if (!load) throw new Error("That load does not belong to this workspace.");
  if (scope === "BUSINESS") {
    throw new Error("Business overhead cannot be linked to a load.");
  }
  if (!truckId || load.truckId !== truckId) {
    throw new Error("The linked load belongs to another truck.");
  }
}

/** A stable ordering for pickers and tables: active first, then by name. */
export function orderedTrucks(trucks: Truck[]): Truck[] {
  return [...trucks].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );
}

export function loadsForTruck<T extends Load>(loads: T[], truckId: string | null): T[] {
  return truckId ? loads.filter((l) => l.truckId === truckId) : loads;
}

/**
 * Expenses attributable to one unit.
 *
 * Business overhead is deliberately NOT included: a unit reports what it
 * caused, and the shared costs are subtracted once at the fleet level.
 */
export function expensesForTruck<T extends Expense>(expenses: T[], truckId: string | null): T[] {
  if (!truckId) return expenses;
  return expenses.filter((e) => e.scope === "TRUCK" && e.truckId === truckId);
}

/** Overhead the fleet carries between its units. */
export function overheadExpenses<T extends Expense>(expenses: T[]): T[] {
  return expenses.filter((e) => e.scope === "BUSINESS");
}

/** Costs that belong to some unit, whichever one. */
export function directExpenses<T extends Expense>(expenses: T[]): T[] {
  return expenses.filter((e) => e.scope !== "BUSINESS");
}

/** True once the business is actually running more than one unit. */
export function isFleet(dataset: Pick<Dataset, "trucks">): boolean {
  return activeTrucks(dataset.trucks).length > 1;
}
