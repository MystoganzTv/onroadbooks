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
