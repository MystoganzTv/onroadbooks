"use server";

import { revalidatePath } from "next/cache";

import { repositoryWith } from "./guards";
import { driverSchema } from "@/lib/schemas";
import { fieldErrorsFrom, type ActionResult } from "./types";

function revalidateDrivers() {
  revalidatePath("/drivers");
  revalidatePath("/loads");
  revalidatePath("/driver-settlements");
}

export async function createDriverAction(values: unknown): Promise<ActionResult> {
  const parsed = driverSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  try {
    const driver = await (await repositoryWith("fleet", "manage_drivers")).createDriver(parsed.data);
    revalidateDrivers();
    return { ok: true, id: driver.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not add that driver." };
  }
}

export async function updateDriverAction(id: string, values: unknown): Promise<ActionResult> {
  const parsed = driverSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  try {
    await (await repositoryWith("fleet", "manage_drivers")).updateDriver(id, parsed.data);
    revalidateDrivers();
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update that driver." };
  }
}

export async function setDriverActiveAction(id: string, active: boolean): Promise<ActionResult> {
  try {
    await (await repositoryWith("fleet", "manage_drivers")).setDriverActive(id, active);
    revalidateDrivers();
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update that driver." };
  }
}
