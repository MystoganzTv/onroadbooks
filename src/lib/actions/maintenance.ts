"use server";

import { revalidatePath } from "next/cache";

import { getRepository } from "@/lib/db";
import { maintenanceSchema } from "@/lib/schemas";
import type { MaintenanceBasis, MaintenanceType } from "@/lib/types";
import { fieldErrorsFrom, type ActionResult } from "./types";

function revalidateAll() {
  revalidatePath("/truck");
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
}

export async function createMaintenanceAction(values: unknown): Promise<ActionResult> {
  const parsed = maintenanceSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  try {
    const record = await getRepository().createMaintenance({
      ...parsed.data,
      type: parsed.data.type as MaintenanceType,
      basis: parsed.data.basis as MaintenanceBasis,
    });
    revalidateAll();
    return { ok: true, id: record.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save the service record.",
    };
  }
}

export async function updateMaintenanceAction(
  id: string,
  values: unknown,
): Promise<ActionResult> {
  const parsed = maintenanceSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  try {
    await getRepository().updateMaintenance(id, {
      ...parsed.data,
      type: parsed.data.type as MaintenanceType,
      basis: parsed.data.basis as MaintenanceBasis,
    });
    revalidateAll();
    return { ok: true, id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update the service record.",
    };
  }
}

export async function deleteMaintenanceAction(id: string): Promise<ActionResult> {
  try {
    await getRepository().deleteMaintenance(id);
    revalidateAll();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not delete the service record.",
    };
  }
}
