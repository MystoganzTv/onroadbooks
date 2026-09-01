"use server";

import { revalidatePath } from "next/cache";

import {
  buildSettlementSnapshot,
  settlementBounds,
  settlementLabel,
} from "@/lib/finance/settlement";
import { settlementNotesSchema, settlementRefSchema } from "@/lib/schemas";
import { todayISO } from "@/lib/periods";
import type { SettlementHalf } from "@/lib/types";
import { fieldErrorsFrom, type ActionResult } from "./types";
import { repositoryWith } from "./guards";

function revalidate() {
  revalidatePath("/settlements");
  revalidatePath("/dashboard");
  revalidatePath("/reserves");
}

function failed(error: unknown, fallback: string): ActionResult {
  return { ok: false, error: error instanceof Error ? error.message : fallback };
}

/**
 * Closing a settlement.
 *
 * The snapshot is computed HERE, on the server, from the rows as they stand
 * at this moment -- never from anything the browser sent. The same call posts
 * the reserve contributions the snapshot implies, so a bucket balance is
 * always traceable to a settlement the owner actually closed.
 */
export async function closeSettlementAction(values: unknown): Promise<ActionResult> {
  const parsed = settlementRefSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: "That settlement period is not valid.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const { month, half } = parsed.data as { month: string; half: SettlementHalf };

  try {
    const repository = await repositoryWith("cockpit", "manage_owner_finances");
    const dataset = await repository.getDataset();
    const range = settlementBounds(month, half);

    if (todayISO() <= range.end) {
      return {
        ok: false,
        error: "This settlement period has not finished yet. It can be closed once it ends.",
      };
    }

    const snapshot = buildSettlementSnapshot(
      dataset.loads,
      dataset.expenses,
      range,
      dataset.settings,
      dataset.reserveAccounts,
      dataset.paymentEvents,
    );

    const settlement = await repository.ensureSettlement(month, half);
    if (settlement.status === "CLOSED") {
      return { ok: false, error: "That settlement is already closed." };
    }

    await repository.closeSettlement(settlement.id, {
      snapshot,
      contributions: snapshot.reserves
        .filter((reserve) => reserve.amount > 0)
        .map((reserve) => ({
          accountId: reserve.accountId,
          amount: reserve.amount,
          description: `${reserve.pct}% ${
            reserve.basis === "OPERATING_PROFIT" ? "of Operating Profit" : "of Booked Revenue"
          } - ${settlementLabel(month, half)}`,
        })),
    });

    revalidate();
    return { ok: true, id: settlement.id };
  } catch (error) {
    return failed(error, "Could not close that settlement.");
  }
}

/** Reopening clears the snapshot and reverses only the rows the close wrote. */
export async function reopenSettlementAction(id: string): Promise<ActionResult> {
  try {
    await (await repositoryWith("cockpit", "manage_owner_finances")).reopenSettlement(id);
    revalidate();
    return { ok: true, id };
  } catch (error) {
    return failed(error, "Could not reopen that settlement.");
  }
}

export async function updateSettlementNotesAction(values: unknown): Promise<ActionResult> {
  const parsed = settlementNotesSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  try {
    await (await repositoryWith("cockpit", "manage_owner_finances")).updateSettlementNotes(
      parsed.data.id,
      parsed.data.notes ?? null,
    );
    revalidate();
    return { ok: true, id: parsed.data.id };
  } catch (error) {
    return failed(error, "Could not save that note.");
  }
}
