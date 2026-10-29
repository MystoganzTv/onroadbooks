"use server";

import { revalidatePath } from "next/cache";
import { requireWritableSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { dispatcherSchema } from "@/lib/dispatchers";
import { fieldErrorsFrom, type ActionResult } from "./types";

export async function saveDispatcherAction(id: string | null, values: unknown): Promise<ActionResult> {
  const parsed = dispatcherSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  try {
    const session = await requireWritableSession("manage_loads");
    const dispatcher = await getRepository(session.businessId).saveDispatcher(id, parsed.data);
    revalidatePath("/dispatchers");
    revalidatePath("/loads", "layout");
    return { ok: true, id: dispatcher.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save the dispatcher." };
  }
}

/**
 * Marks one load's dispatch commission paid (on the browser's local day, so the
 * server timezone cannot shift it) or owed again. Records the fact only: the
 * commission is already on the books as the load's dispatch cost.
 */
export async function setDispatchPaidAction(loadId: string, paidDate: string | null): Promise<ActionResult> {
  if (typeof loadId !== "string" || !loadId) return { ok: false, error: "Could not update the payment." };
  if (paidDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(paidDate)) return { ok: false, error: "Could not update the payment." };
  try {
    const session = await requireWritableSession("manage_loads");
    await getRepository(session.businessId).setLoadDispatchPaid(loadId, paidDate);
    revalidatePath("/dispatchers");
    return { ok: true, id: loadId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update the payment." };
  }
}
