"use server";

import { revalidatePath } from "next/cache";
import { requireWritableSession } from "@/lib/auth";
import { getDataset, getRepository } from "@/lib/db";
import { brokerContactsSchema, brokerSchema } from "@/lib/broker-schema";
import { brokerNameKey } from "@/lib/brokers";
import { fieldErrorsFrom, type ActionResult } from "./types";

function revalidateBrokers() {
  revalidatePath("/brokers", "layout");
  revalidatePath("/loads", "layout");
  revalidatePath("/analytics", "layout");
  revalidatePath("/dashboard");
}

/**
 * Saving under a name another profile already uses is the moment the owner
 * realises two profiles are one broker, so the refusal names that profile and
 * the dialog can offer to merge instead of dead-ending.
 */
export type SaveBrokerResult =
  | ActionResult
  | { ok: false; error: string; fieldErrors?: Record<string, string>; duplicateOf: { id: string; name: string } };

export async function saveBrokerAction(id: string | null, values: unknown): Promise<SaveBrokerResult> {
  const parsed = brokerSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  try {
    const session = await requireWritableSession("manage_loads");
    const dataset = await getDataset(session.businessId);
    const duplicate = dataset.brokers?.find((row) => row.nameKey === brokerNameKey(parsed.data.name) && row.id !== id);
    if (duplicate) {
      return {
        ok: false,
        error: "A broker with that name already exists.",
        fieldErrors: { name: "A broker with that name already exists." },
        duplicateOf: { id: duplicate.id, name: duplicate.name },
      };
    }
    const broker = await getRepository(session.businessId).saveBroker(id, parsed.data);
    revalidateBrokers();
    return { ok: true, id: broker.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save the broker." };
  }
}

export async function saveBrokerContactsAction(brokerId: string, values: unknown): Promise<ActionResult> {
  const parsed = brokerContactsSchema.safeParse(values);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "Check the contact details.", fieldErrors: fieldErrorsFrom(parsed.error.issues.map((row) => ({ ...row, path: row.path.slice(1) }))) };
  }
  try {
    const session = await requireWritableSession("manage_loads");
    const broker = await getRepository(session.businessId).saveBrokerContacts(brokerId, parsed.data);
    revalidateBrokers();
    return { ok: true, id: broker.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save the contact." };
  }
}

export async function mergeBrokerAction(sourceId: string, targetId: string): Promise<ActionResult> {
  try {
    const session = await requireWritableSession("manage_loads");
    const broker = await getRepository(session.businessId).mergeBroker(sourceId, targetId);
    revalidateBrokers();
    return { ok: true, id: broker.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not merge the brokers." };
  }
}

export async function deleteBrokerAction(id: string): Promise<ActionResult> {
  try {
    const session = await requireWritableSession("manage_loads");
    await getRepository(session.businessId).deleteBroker(id);
    revalidateBrokers();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not delete the broker." };
  }
}
