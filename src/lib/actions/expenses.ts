"use server";

import { revalidatePath } from "next/cache";

import { requireWritableSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { expenseSchema, loadExpenseAmountSchema } from "@/lib/schemas";
import type { ExpenseCategoryId } from "@/lib/types";
import { fieldErrorsFrom, type ActionResult } from "./types";

function revalidateAll() {
  revalidatePath("/dashboard");
  revalidatePath("/expenses");
  revalidatePath("/reports");
  revalidatePath("/truck");
  revalidatePath("/fuel");
}

export async function updateLoadExpenseAction(id: string, amount: unknown): Promise<ActionResult> {
  const parsed = loadExpenseAmountSchema.safeParse(amount);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a valid amount." };
  }

  try {
    const repository = getRepository(
      (await requireWritableSession("manage_expenses")).businessId,
    );
    const load = await repository.updateLoadExpense(id, parsed.data);
    revalidateAll();
    revalidatePath("/loads");
    revalidatePath(`/loads/${load.id}`);
    return { ok: true, id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not update the load expense.",
    };
  }
}

export async function createExpenseAction(values: unknown): Promise<ActionResult> {
  const parsed = expenseSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  try {
    const expense = await getRepository((await requireWritableSession("manage_expenses")).businessId).createExpense({
      ...parsed.data,
      category: parsed.data.category as ExpenseCategoryId,
    });
    revalidateAll();
    return { ok: true, id: expense.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save the expense." };
  }
}

export async function updateExpenseAction(id: string, values: unknown): Promise<ActionResult> {
  const parsed = expenseSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  try {
    await getRepository((await requireWritableSession("manage_expenses")).businessId).updateExpense(id, {
      ...parsed.data,
      category: parsed.data.category as ExpenseCategoryId,
    });
    revalidateAll();
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update the expense." };
  }
}

export async function deleteExpenseAction(id: string): Promise<ActionResult> {
  try {
    await getRepository((await requireWritableSession("manage_expenses")).businessId).deleteExpense(id);
    revalidateAll();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not delete the expense." };
  }
}
