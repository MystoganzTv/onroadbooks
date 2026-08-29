"use server";

import { revalidatePath } from "next/cache";

import { getRepository } from "@/lib/db";
import { settingsSchema, truckSchema } from "@/lib/schemas";
import { fieldErrorsFrom, type ActionResult } from "./types";

function revalidateAll() {
  revalidatePath("/", "layout");
}

export async function updateSettingsAction(values: unknown): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  try {
    const repository = getRepository();
    await repository.updateBusiness({
      name: parsed.data.businessName,
      currency: parsed.data.currency.toUpperCase(),
    });
    await repository.updateSettings({
      taxReservePct: parsed.data.taxReservePct,
      maintenanceReservePct: parsed.data.maintenanceReservePct,
      categoryBehavior: parsed.data.categoryBehavior,
      ratingGreatPerMile: parsed.data.ratingGreatPerMile,
      ratingGoodPerMile: parsed.data.ratingGoodPerMile,
      ratingMarginalPerMile: parsed.data.ratingMarginalPerMile,
      deadheadWarnPct: parsed.data.deadheadWarnPct,
      maintenanceWarnMiles: parsed.data.maintenanceWarnMiles,
      maintenanceWarnDays: parsed.data.maintenanceWarnDays,
    });
    revalidateAll();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save settings." };
  }
}

export async function updateTruckAction(values: unknown): Promise<ActionResult> {
  const parsed = truckSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  try {
    await getRepository().updateTruck(parsed.data);
    revalidateAll();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save the truck." };
  }
}
