"use server";

import { revalidatePath } from "next/cache";

import { requireWritableSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { fuelSchema } from "@/lib/schemas";
import { fieldErrorsFrom, type ActionResult } from "./types";

function revalidateAll() {
  revalidatePath("/dashboard");
  revalidatePath("/fuel");
  revalidatePath("/expenses");
  revalidatePath("/reports");
  revalidatePath("/truck");
}

export async function createFuelEntryAction(values: unknown): Promise<ActionResult> {
  const parsed = fuelSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  try {
    const entry = await getRepository((await requireWritableSession()).businessId).createFuelEntry(parsed.data);
    revalidateAll();
    return { ok: true, id: entry.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save the fuel entry." };
  }
}

export async function updateFuelEntryAction(id: string, values: unknown): Promise<ActionResult> {
  const parsed = fuelSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  try {
    await getRepository((await requireWritableSession()).businessId).updateFuelEntry(id, parsed.data);
    revalidateAll();
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update the fuel entry." };
  }
}

export async function deleteFuelEntryAction(id: string): Promise<ActionResult> {
  try {
    await getRepository((await requireWritableSession()).businessId).deleteFuelEntry(id);
    revalidateAll();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not delete the fuel entry." };
  }
}
