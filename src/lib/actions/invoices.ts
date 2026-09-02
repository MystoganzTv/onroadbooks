"use server";

import { revalidatePath } from "next/cache";

import { requireWritableSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { invoicePaymentSummary } from "@/lib/invoices";
import { duplicateInvoiceNumber, invoiceIssuePatch } from "@/lib/invoices";
import { invoiceSchema, paymentEventSchema } from "@/lib/schemas";
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
    // `invoicePaymentSummary` is the one reader of what is still owed. Its
    // own arithmetic also knows about a load marked PAID before payment
    // events existed -- counting that as a zero balance is what stops this
    // from posting the whole rate a second time.
    const { balance } = invoicePaymentSummary(load, dataset.paymentEvents);
    if (balance <= 0) return { ok: false, error: "That invoice is already fully paid." };
    await repository.createPaymentEvent({ loadId, date: paidOn, amount: balance });
    revalidateInvoicePaths(loadId);
    return { ok: true, id: loadId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not record payment." };
  }
}

export async function recordInvoicePaymentAction(values: unknown): Promise<ActionResult> {
  const parsed = paymentEventSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the payment.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  try {
    const session = await requireWritableSession("manage_finances");
    const event = await getRepository(session.businessId).createPaymentEvent(parsed.data);
    revalidateInvoicePaths(event.loadId);
    return { ok: true, id: event.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not record payment.",
    };
  }
}

export async function voidInvoiceAction(loadId: string): Promise<ActionResult> {
  try {
    const session = await requireWritableSession("manage_finances");
    const repository = getRepository(session.businessId);
    const dataset = await repository.getDataset();
    const load = dataset.loads.find((row) => row.id === loadId);
    if (!load) return { ok: false, error: "Load not found." };
    if (
      load.status === "PAID" ||
      dataset.paymentEvents.some((event) => event.loadId === load.id)
    ) {
      return { ok: false, error: "An invoice with recorded payments cannot be voided." };
    }
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
