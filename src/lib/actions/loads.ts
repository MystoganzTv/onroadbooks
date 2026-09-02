"use server";

import { revalidatePath } from "next/cache";

import { requireWritableSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { locationReviewMessage, reviewLocation } from "@/lib/locations";
import { loadSchema, type LoadFormValues } from "@/lib/schemas";
import type { PaymentStatus } from "@/lib/types";
import { fieldErrorsFrom, type ActionResult } from "./types";

function revalidateAll() {
  revalidatePath("/dashboard");
  revalidatePath("/loads");
  revalidatePath("/reports");
  revalidatePath("/truck");
}

function confirmedLocationOverrides(values: unknown): { origin: boolean; destination: boolean } {
  if (!values || typeof values !== "object") return { origin: false, destination: false };
  const overrides = (values as { locationOverrides?: unknown }).locationOverrides;
  if (!overrides || typeof overrides !== "object") return { origin: false, destination: false };
  const value = overrides as { origin?: unknown; destination?: unknown };
  return { origin: value.origin === true, destination: value.destination === true };
}

async function loadLocationErrors(
  load: LoadFormValues,
  rawValues: unknown,
): Promise<Record<string, string>> {
  const overrides = confirmedLocationOverrides(rawValues);
  const [origin, destination] = await Promise.all([
    reviewLocation(load.originCity, load.originState),
    reviewLocation(load.destinationCity, load.destinationState),
  ]);
  const errors: Record<string, string> = {};

  for (const location of [
    {
      city: load.originCity,
      state: load.originState,
      review: origin,
      confirmed: overrides.origin,
      cityField: "originCity",
      stateField: "originState",
    },
    {
      city: load.destinationCity,
      state: load.destinationState,
      review: destination,
      confirmed: overrides.destination,
      cityField: "destinationCity",
      stateField: "destinationState",
    },
  ]) {
    if (location.review.valid) continue;
    const message = locationReviewMessage(location.city, location.state, location.review);
    if (!message) continue;
    // A made-up state/province code is never accepted. A real state paired
    // with an unlisted locality can be saved only after the explicit warning.
    if (!location.review.stateValid || !location.confirmed) {
      const field = location.review.alternatives.length > 0
        ? location.stateField
        : location.cityField;
      errors[field] = `${message} Choose a suggestion or confirm the manual location.`;
    }
  }

  return errors;
}

export async function createLoadAction(values: unknown): Promise<ActionResult> {
  const parsed = loadSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  try {
    const session = await requireWritableSession("manage_loads");
    const locationErrors = await loadLocationErrors(parsed.data, values);
    if (Object.keys(locationErrors).length > 0) {
      return {
        ok: false,
        error: "Review the highlighted city and state.",
        fieldErrors: locationErrors,
      };
    }
    const load = await getRepository(session.businessId).createLoad(parsed.data);
    revalidateAll();
    return { ok: true, id: load.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not save the load." };
  }
}

export async function updateLoadAction(id: string, values: unknown): Promise<ActionResult> {
  const parsed = loadSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  try {
    const session = await requireWritableSession("manage_loads");
    const locationErrors = await loadLocationErrors(parsed.data, values);
    if (Object.keys(locationErrors).length > 0) {
      return {
        ok: false,
        error: "Review the highlighted city and state.",
        fieldErrors: locationErrors,
      };
    }
    await getRepository(session.businessId).updateLoad(id, parsed.data);
    revalidateAll();
    revalidatePath(`/loads/${id}`);
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update the load." };
  }
}

export async function updateLoadStatusAction(
  id: string,
  status: PaymentStatus,
): Promise<ActionResult> {
  try {
    const repository = getRepository((await requireWritableSession("manage_loads")).businessId);
    const dataset = await repository.getDataset();
    const load = dataset.loads.find((l) => l.id === id);
    if (!load) return { ok: false, error: "Load not found." };

    await repository.updateLoad(id, { ...load, status });
    revalidateAll();
    revalidatePath(`/loads/${id}`);
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update status." };
  }
}

export async function deleteLoadAction(id: string): Promise<ActionResult> {
  try {
    await getRepository((await requireWritableSession("manage_loads")).businessId).deleteLoad(id);
    revalidateAll();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not delete the load." };
  }
}
