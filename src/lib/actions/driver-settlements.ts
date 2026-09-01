"use server";

import { revalidatePath } from "next/cache";

import { repositoryWith } from "./guards";
import {
  driverSettlementAdjustmentSchema,
  driverSettlementPaymentSchema,
  driverSettlementSchema,
} from "@/lib/schemas";
import { fieldErrorsFrom, type ActionResult } from "./types";

function revalidateAccounting() {
  revalidatePath("/driver-settlements");
  revalidatePath("/drivers");
  revalidatePath("/loads");
  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  revalidatePath("/fleet");
  revalidatePath("/reports");
  revalidatePath("/drivers/[id]", "page");
}

export async function createDriverSettlementAction(values: unknown): Promise<ActionResult> {
  const parsed = driverSettlementSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  try {
    const settlement = await (
      await repositoryWith("fleet", "manage_driver_settlements")
    ).createDriverSettlement(parsed.data);
    revalidateAccounting();
    return { ok: true, id: settlement.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not create that statement." };
  }
}

export async function payDriverSettlementAction(values: unknown): Promise<ActionResult> {
  const parsed = driverSettlementPaymentSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: "Choose a valid payment date." };
  try {
    await (await repositoryWith("fleet", "manage_driver_settlements")).payDriverSettlement(
      parsed.data.id,
      parsed.data.paidOn,
    );
    revalidateAccounting();
    revalidatePath(`/driver-settlements/${parsed.data.id}`);
    return { ok: true, id: parsed.data.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not pay that statement." };
  }
}

export async function addDriverSettlementAdjustmentAction(values: unknown): Promise<ActionResult> {
  const parsed = driverSettlementAdjustmentSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  try {
    const adjustment = await (
      await repositoryWith("fleet", "manage_driver_settlements")
    ).addDriverSettlementAdjustment(parsed.data.settlementId, {
      type: parsed.data.type,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
    });
    revalidateAccounting();
    revalidatePath(`/driver-settlements/${parsed.data.settlementId}`);
    return { ok: true, id: adjustment.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not add that adjustment." };
  }
}

export async function deleteDriverSettlementAdjustmentAction(
  settlementId: string,
  adjustmentId: string,
): Promise<ActionResult> {
  try {
    await (
      await repositoryWith("fleet", "manage_driver_settlements")
    ).deleteDriverSettlementAdjustment(settlementId, adjustmentId);
    revalidateAccounting();
    revalidatePath(`/driver-settlements/${settlementId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not delete that adjustment." };
  }
}

export async function deleteDriverSettlementAction(id: string): Promise<ActionResult> {
  try {
    await (await repositoryWith("fleet", "manage_driver_settlements")).deleteDriverSettlement(id);
    revalidateAccounting();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not delete that draft." };
  }
}
