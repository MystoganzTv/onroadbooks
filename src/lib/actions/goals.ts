"use server";

import { revalidatePath } from "next/cache";

import { goalSchema } from "@/lib/schemas";
import { fieldErrorsFrom, type ActionResult } from "./types";
import { repositoryWith } from "./guards";

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
    await (await repositoryWith("cockpit", "manage_business")).updateGoals({
      monthlyRevenueTarget: parsed.data.monthlyRevenueTarget,
      monthlyProfitTarget: parsed.data.monthlyProfitTarget,
      targetProfitPerMile: parsed.data.targetProfitPerMile,
      maxDeadheadPct: parsed.data.maxDeadheadPct,
      targetLoads: parsed.data.targetLoads ?? null,
      workingDaysPerWeek: parsed.data.workingDaysPerWeek,
      expectedMonthlyMiles: parsed.data.expectedMonthlyMiles,
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
