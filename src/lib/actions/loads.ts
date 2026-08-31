"use server";

import { revalidatePath } from "next/cache";

import { requireWritableSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { loadSchema } from "@/lib/schemas";
import type { PaymentStatus } from "@/lib/types";
import { fieldErrorsFrom, type ActionResult } from "./types";

function revalidateAll() {
  revalidatePath("/dashboard");
  revalidatePath("/loads");
  revalidatePath("/reports");
  revalidatePath("/truck");
}

export async function createLoadAction(values: unknown): Promise<ActionResult> {
  const parsed = loadSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  try {
    const load = await getRepository((await requireWritableSession("manage_loads")).businessId).createLoad(parsed.data);
    revalidateAll();
    return { ok: true, id: load.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save the load." };
  }
}

export async function updateLoadAction(id: string, values: unknown): Promise<ActionResult> {
  const parsed = loadSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  try {
    await getRepository((await requireWritableSession("manage_loads")).businessId).updateLoad(id, parsed.data);
    revalidateAll();
    revalidatePath(`/loads/${id}`);
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update the load." };
  }
}

export async function updateLoadStatusAction(
  id: string,
  status: PaymentStatus,
): Promise<ActionResult> {
  try {
    const repository = getRepository((await requireWritableSession("manage_loads")).businessId);
    const dataset = await repository.getDataset();
    const load = dataset.loads.find((l) => l.id === id);
    if (!load) return { ok: false, error: "Load not found." };

    await repository.updateLoad(id, { ...load, status });
    revalidateAll();
    revalidatePath(`/loads/${id}`);
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update status." };
  }
}

export async function deleteLoadAction(id: string): Promise<ActionResult> {
  try {
    await getRepository((await requireWritableSession("manage_loads")).businessId).deleteLoad(id);
    revalidateAll();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not delete the load." };
  }
}
