"use server";

import { revalidatePath } from "next/cache";

import { requireWritableSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { duplicateInvoiceNumber, invoiceIssuePatch } from "@/lib/invoices";
import { invoiceSchema } from "@/lib/schemas";
import { fieldErrorsFrom, type ActionResult } from "./types";

function revalidateInvoicePaths(loadId: string) {
  revalidatePath("/invoices");
  revalidatePath("/loads");
  revalidatePath(`/loads/${loadId}`);
  revalidatePath("/reports");
  revalidatePath("/dashboard");
}

export async function issueInvoiceAction(loadId: string, values: unknown): Promise<ActionResult> {
  const parsed = invoiceSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  try {
    const session = await requireWritableSession("manage_finances");
    const repository = getRepository(session.businessId);
    const dataset = await repository.getDataset();
    const load = dataset.loads.find((row) => row.id === loadId);
    if (!load) return { ok: false, error: "Load not found." };
    if (duplicateInvoiceNumber(dataset.loads, loadId, parsed.data.invoiceNumber)) {
      return {
        ok: false,
        error: "That invoice number is already in use.",
        fieldErrors: { invoiceNumber: "Use a unique invoice number" },
      };
    }
    // Issuing the document never un-collects money already in the bank.
    await repository.updateLoad(loadId, { ...load, ...invoiceIssuePatch(load, parsed.data) });
    revalidateInvoicePaths(loadId);
    return { ok: true, id: loadId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not issue invoice." };
  }
}

export async function markInvoicePaidAction(loadId: string, paidOn: string): Promise<ActionResult> {
  try {
    const session = await requireWritableSession("manage_finances");
    const repository = getRepository(session.businessId);
    const dataset = await repository.getDataset();
    const load = dataset.loads.find((row) => row.id === loadId);
    if (!load?.invoiceNumber) return { ok: false, error: "Issue the invoice before marking it paid." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return { ok: false, error: "Use a valid payment date." };
    await repository.updateLoad(loadId, { ...load, status: "PAID", invoicePaidDate: paidOn });
    revalidateInvoicePaths(loadId);
    return { ok: true, id: loadId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not record payment." };
  }
}

export async function voidInvoiceAction(loadId: string): Promise<ActionResult> {
  try {
    const session = await requireWritableSession("manage_finances");
    const repository = getRepository(session.businessId);
    const dataset = await repository.getDataset();
    const load = dataset.loads.find((row) => row.id === loadId);
    if (!load) return { ok: false, error: "Load not found." };
    if (load.status === "PAID") return { ok: false, error: "A paid invoice cannot be voided." };
    await repository.updateLoad(loadId, {
      ...load,
      status: "PENDING",
      invoiceNumber: null,
      invoiceDate: null,
      invoiceDueDate: null,
      invoicePaidDate: null,
      billToName: null,
      billToEmail: null,
      billToAddress: null,
      invoiceNotes: null,
    });
    revalidateInvoicePaths(loadId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not void invoice." };
  }
}
