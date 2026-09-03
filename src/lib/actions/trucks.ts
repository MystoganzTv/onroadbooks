"use server";

import { revalidatePath } from "next/cache";

import { requireWritableSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { activeTrucks } from "@/lib/fleet";
import { truckAllowance } from "@/lib/plans";
import {
  truckArchiveSchema,
  truckFinancingConfirmationSchema,
  truckOperatingCostExemptionsSchema,
  truckSchema,
} from "@/lib/schemas";
import { fieldErrorsFrom, type ActionResult } from "./types";

function revalidate() {
  revalidatePath("/", "layout");
}

function failed(error: unknown, fallback: string): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : fallback };
}

/**
 * Adding a truck.
 *
 * The plan limit is checked HERE, against the units that actually exist,
 * because hiding the button is a suggestion and this is a rule. The refusal
 * comes back in the words the owner should read, not as a code.
 */
export async function createTruckAction(values: unknown): Promise<ActionResult> {
  const parsed = truckSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  try {
    const repository = getRepository((await requireWritableSession("manage_fleet")).businessId);
    const dataset = await repository.getDataset();
    const allowance = truckAllowance(dataset.subscription, activeTrucks(dataset.trucks).length);

    if (!allowance.canAdd) {
      return { ok: false, error: allowance.reason ?? "Your plan does not cover another truck." };
    }

    const truck = await repository.createTruck(parsed.data);
    revalidate();
    return { ok: true, id: truck.id };
  } catch (error) {
    return failed(error, "Could not add that truck.");
  }
}

export async function updateTruckByIdAction(id: string, values: unknown): Promise<ActionResult> {
  const parsed = truckSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  try {
    await getRepository((await requireWritableSession("manage_fleet")).businessId).updateTruck(parsed.data, id);
    revalidate();
    return { ok: true, id };
  } catch (error) {
    return failed(error, "Could not save the truck.");
  }
}

/**
 * Records an owner's explicit answer instead of treating missing debt rows as
 * zero. The answer belongs to one truck and cannot be asserted while the same
 * truck still has an active financing obligation or monthly payment on file.
 */
export async function updateTruckFinancingConfirmationAction(
  values: unknown,
): Promise<ActionResult> {
  const parsed = truckFinancingConfirmationSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: "That financing answer is not valid." };
  }

  try {
    const session = await requireWritableSession("manage_owner_finances");
    const repository = getRepository(session.businessId);
    const dataset = await repository.getDataset();
    const truck = dataset.trucks.find((candidate) => candidate.id === parsed.data.truckId);
    if (!truck) {
      return { ok: false, error: "That truck does not belong to this workspace." };
    }

    if (parsed.data.confirmedNone) {
      const hasActiveObligation = dataset.financialObligations.some(
        (obligation) => obligation.truckId === truck.id && obligation.active,
      );
      if ((truck.monthlyPayment ?? 0) > 0 || hasActiveObligation) {
        return {
          ok: false,
          error: "Remove or close this truck's active financing before confirming it has none.",
        };
      }
    }

    await repository.setTruckFinancingConfirmedNone(
      truck.id,
      parsed.data.confirmedNone ? true : null,
    );
    revalidate();
    return { ok: true, id: truck.id };
  } catch (error) {
    return failed(error, "Could not save the truck's financing status.");
  }
}

/**
 * Stores explicit owner exemptions for the operating-cost checklist. Recorded
 * coverage is never asserted here: Calculator derives it from the ledger in
 * the exact cost-basis window.
 */
export async function updateTruckOperatingCostExemptionsAction(
  values: unknown,
): Promise<ActionResult> {
  const parsed = truckOperatingCostExemptionsSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: "That operating-cost profile is not valid." };
  }

  try {
    const session = await requireWritableSession("manage_owner_finances");
    const repository = getRepository(session.businessId);
    const dataset = await repository.getDataset();
    const truck = dataset.trucks.find((candidate) => candidate.id === parsed.data.truckId);
    if (!truck) {
      return { ok: false, error: "That truck does not belong to this workspace." };
    }

    await repository.setTruckOperatingCostExemptions(
      truck.id,
      parsed.data.exemptions,
    );
    revalidate();
    return { ok: true, id: truck.id };
  } catch (error) {
    return failed(error, "Could not save the truck's operating-cost profile.");
  }
}

/**
 * Retiring a truck. Nothing is deleted: its loads, expenses, fuel and service
 * history stay where they are and keep appearing in past reports. It stops
 * being something new work can be booked against, and it stops counting
 * against the plan's limit.
 */
export async function archiveTruckAction(values: unknown): Promise<ActionResult> {
  const parsed = truckArchiveSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: "That is not a truck we can retire." };
  }

  try {
    await getRepository((await requireWritableSession("manage_fleet")).businessId).archiveTruck(
      parsed.data.id,
      parsed.data.soldOn ?? null,
    );
    revalidate();
    return { ok: true, id: parsed.data.id };
  } catch (error) {
    return failed(error, "Could not retire that truck.");
  }
}

export async function restoreTruckAction(id: string): Promise<ActionResult> {
  try {
    const repository = getRepository((await requireWritableSession("manage_fleet")).businessId);
    const dataset = await repository.getDataset();
    const allowance = truckAllowance(dataset.subscription, activeTrucks(dataset.trucks).length);

    if (!allowance.canAdd) {
      return {
        ok: false,
        error: `Bringing that truck back would put you over your plan's limit of ${allowance.limit}.`,
      };
    }

    await repository.restoreTruck(id);
    revalidate();
    return { ok: true, id };
  } catch (error) {
    return failed(error, "Could not bring that truck back.");
  }
}
