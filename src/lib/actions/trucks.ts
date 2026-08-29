"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { activeTrucks } from "@/lib/fleet";
import { truckAllowance } from "@/lib/plans";
import { truckArchiveSchema, truckSchema } from "@/lib/schemas";
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
    const repository = getRepository((await requireSession()).businessId);
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
    await getRepository((await requireSession()).businessId).updateTruck(parsed.data, id);
    revalidate();
    return { ok: true, id };
  } catch (error) {
    return failed(error, "Could not save the truck.");
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
    await getRepository((await requireSession()).businessId).archiveTruck(
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
    const repository = getRepository((await requireSession()).businessId);
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
