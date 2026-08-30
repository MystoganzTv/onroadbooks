"use server";

import { revalidatePath } from "next/cache";

import { requireWritableSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { reserveAccountSchema, reserveTransactionSchema } from "@/lib/schemas";
import { fieldErrorsFrom, type ActionResult } from "./types";

function revalidate() {
  revalidatePath("/reserves");
  revalidatePath("/dashboard");
  revalidatePath("/settlements");
  revalidatePath("/truck");
}

function failed(error: unknown, fallback: string): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : fallback };
}

export async function createReserveAccountAction(values: unknown): Promise<ActionResult> {
  const parsed = reserveAccountSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  try {
    const account = await getRepository(
      (await requireWritableSession()).businessId,
    ).createReserveAccount(parsed.data);
    revalidate();
    return { ok: true, id: account.id };
  } catch (error) {
    return failed(error, "Could not create that bucket.");
  }
}

export async function updateReserveAccountAction(
  id: string,
  values: unknown,
): Promise<ActionResult> {
  const parsed = reserveAccountSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  try {
    await getRepository((await requireWritableSession()).businessId).updateReserveAccount(
      id,
      parsed.data,
    );
    revalidate();
    return { ok: true, id };
  } catch (error) {
    return failed(error, "Could not update that bucket.");
  }
}

export async function deleteReserveAccountAction(id: string): Promise<ActionResult> {
  try {
    await getRepository((await requireWritableSession()).businessId).deleteReserveAccount(id);
    revalidate();
    return { ok: true };
  } catch (error) {
    return failed(error, "Could not delete that bucket.");
  }
}

export async function createReserveTransactionAction(values: unknown): Promise<ActionResult> {
  const parsed = reserveTransactionSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  try {
    const txn = await getRepository(
      (await requireWritableSession()).businessId,
    ).createReserveTransaction(parsed.data);
    revalidate();
    return { ok: true, id: txn.id };
  } catch (error) {
    return failed(error, "Could not record that movement.");
  }
}

export async function deleteReserveTransactionAction(id: string): Promise<ActionResult> {
  try {
    await getRepository((await requireWritableSession()).businessId).deleteReserveTransaction(id);
    revalidate();
    return { ok: true };
  } catch (error) {
    return failed(error, "Could not remove that movement.");
  }
}
