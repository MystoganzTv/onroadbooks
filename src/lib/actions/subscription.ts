"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { activeTrucks } from "@/lib/fleet";
import { evaluatePlanChange } from "@/lib/plans";
import { planChangeSchema } from "@/lib/schemas";
import { fieldErrorsFrom, type ActionResult } from "./types";

/**
 * Changing plan.
 *
 * The rule is enforced here, on the server, against the trucks the business
 * actually has -- not by hiding a button. Going up is always fine. Going down
 * is refused while more trucks are active than the smaller plan covers,
 * because the alternative is deleting somebody's records to fit a cheaper
 * plan, which is never the right answer.
 */
export async function changePlanAction(values: unknown): Promise<ActionResult> {
  const parsed = planChangeSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: "That is not a plan we offer.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  try {
    const repository = getRepository((await requireSession()).businessId);
    const dataset = await repository.getDataset();

    const decision = evaluatePlanChange(
      dataset.subscription,
      parsed.data.plan,
      activeTrucks(dataset.trucks).length,
    );

    if (!decision.allowed) {
      return { ok: false, error: decision.reason ?? "That plan change is not available." };
    }

    await repository.updateSubscription({ plan: parsed.data.plan });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not change the plan.",
    };
  }
}
