"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireWritableSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { recurringExpenseSuggestions } from "@/lib/recurring-expenses";
import { type ActionResult } from "./types";

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

function revalidateBookkeeping() {
  revalidatePath("/dashboard");
  revalidatePath("/expenses");
  revalidatePath("/loads");
  revalidatePath("/reports");
  revalidatePath("/truck");
}

/** Materialises the selected month's missing truck costs and recurring templates. */
export async function addMonthlyExpensesAction(
  monthValue: unknown,
  truckIdValue: unknown,
): Promise<ActionResult> {
  const month = monthSchema.safeParse(monthValue);
  const truckId = z.string().trim().optional().nullable().safeParse(truckIdValue);
  if (!month.success || !truckId.success) {
    return { ok: false, error: "That month could not be prepared." };
  }

  try {
    const repository = getRepository((await requireWritableSession("manage_expenses")).businessId);
    const dataset = await repository.getDataset();
    const suggestions = recurringExpenseSuggestions(dataset, month.data, truckId.data ?? null);
    for (const suggestion of suggestions) {
      await repository.createExpense(suggestion);
    }
    revalidateBookkeeping();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not add the monthly expenses.",
    };
  }
}
