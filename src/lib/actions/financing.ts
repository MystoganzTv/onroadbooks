"use server";

import { revalidatePath } from "next/cache";

import { requireWritableSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { financialObligationSchema } from "@/lib/schemas";
import { fieldErrorsFrom, type ActionResult } from "./types";

function revalidateFinancing() {
  revalidatePath("/financing");
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  revalidatePath("/calculator");
  revalidatePath("/truck");
}

export async function createFinancialObligationAction(values: unknown): Promise<ActionResult> {
  const parsed = financialObligationSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  try {
    const session = await requireWritableSession("manage_finances");
    const obligation = await getRepository(session.businessId).createFinancialObligation(parsed.data);
    revalidateFinancing();
    return { ok: true, id: obligation.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not create the obligation.",
    };
  }
}

export async function updateFinancialObligationAction(
  id: string,
  values: unknown,
): Promise<ActionResult> {
  const parsed = financialObligationSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  try {
    const session = await requireWritableSession("manage_finances");
    await getRepository(session.businessId).updateFinancialObligation(id, parsed.data);
    revalidateFinancing();
    return { ok: true, id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update the obligation.",
    };
  }
}
