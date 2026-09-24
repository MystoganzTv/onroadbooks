"use server";

import { revalidatePath } from "next/cache";
import { requireWritableSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { brokerSchema } from "@/lib/broker-schema";
import { fieldErrorsFrom, type ActionResult } from "./types";

export async function saveBrokerAction(id: string | null, values: unknown): Promise<ActionResult> {
  const parsed = brokerSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  try {
    const session = await requireWritableSession("manage_loads");
    const broker = await getRepository(session.businessId).saveBroker(id, parsed.data);
    revalidatePath("/brokers", "layout");
    revalidatePath("/loads", "layout");
    revalidatePath("/analytics", "layout");
    revalidatePath("/dashboard");
    return { ok: true, id: broker.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save the broker." };
  }
}
