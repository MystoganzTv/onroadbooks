"use server";

import { revalidatePath } from "next/cache";

import { requireWritableSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { iftaRateKey, isIftaJurisdiction } from "@/lib/ifta";
import { iftaRatesSchema } from "@/lib/schemas";
import type { ActionResult } from "./types";

export async function saveIftaRatesAction(values: unknown): Promise<ActionResult> {
  const parsed = iftaRatesSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: "Check the quarter and tax rates." };
  try {
    const session = await requireWritableSession("manage_finances");
    const repository = getRepository(session.businessId);
    const dataset = await repository.getDataset();
    const rates = { ...dataset.settings.iftaTaxRates };
    for (const [jurisdiction, rate] of Object.entries(parsed.data.rates)) {
      const code = jurisdiction.toUpperCase();
      if (!isIftaJurisdiction(code)) continue;
      rates[iftaRateKey(parsed.data.quarter, code)] = rate;
    }
    await repository.updateSettings({ ...dataset.settings, iftaTaxRates: rates });
    revalidatePath("/ifta");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save IFTA rates." };
  }
}
