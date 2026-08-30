"use server";

import { revalidatePath } from "next/cache";

import { requireWritableSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { goalSchema } from "@/lib/schemas";
import { fieldErrorsFrom, type ActionResult } from "./types";

export async function updateGoalsAction(values: unknown): Promise<ActionResult> {
  const parsed = goalSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  try {
    await getRepository((await requireWritableSession()).businessId).updateGoals({
      monthlyRevenueTarget: parsed.data.monthlyRevenueTarget,
      monthlyProfitTarget: parsed.data.monthlyProfitTarget,
      targetProfitPerMile: parsed.data.targetProfitPerMile,
      maxDeadheadPct: parsed.data.maxDeadheadPct,
      targetLoads: parsed.data.targetLoads ?? null,
      workingDaysPerWeek: parsed.data.workingDaysPerWeek,
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not save your goals.",
    };
  }
}
