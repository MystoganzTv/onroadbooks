"use server";

import { revalidatePath } from "next/cache";

import { requireWritableSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { driverSchema } from "@/lib/schemas";
import { fieldErrorsFrom, type ActionResult } from "./types";

/**
 * Drivers are on every plan in the owner-operator product (ADR 0031): who ran
 * a load and what they earned. No Fleet capability is required.
 */
async function driverRepository() {
  return getRepository((await requireWritableSession("manage_drivers")).businessId);
}

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
    const driver = await (await driverRepository()).createDriver(parsed.data);
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
    await (await driverRepository()).updateDriver(id, parsed.data);
    revalidateDrivers();
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update that driver." };
  }
}

export async function setDriverActiveAction(id: string, active: boolean): Promise<ActionResult> {
  try {
    await (await driverRepository()).setDriverActive(id, active);
    revalidateDrivers();
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update that driver." };
  }
}
