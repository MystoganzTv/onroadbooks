import { roundMoney } from "./calculations";
import type { Load, PaymentEvent, PaymentStatus } from "./types";

export interface InvoicePaymentSummary {
  collected: number;
  balance: number;
  eventCount: number;
  legacyPaid: boolean;
}

export function invoicePaymentSummary(
  load: Pick<Load, "id" | "grossRate" | "status">,
  paymentEvents: PaymentEvent[],
): InvoicePaymentSummary {
  const events = paymentEvents.filter((event) => event.loadId === load.id);
  const legacyPaid = events.length === 0 && load.status === "PAID";
  const collected = roundMoney(load.grossRate);
  return {
    collected,
    balance: 0,
    eventCount: events.length,
    legacyPaid,
  };
}

/** Generating a document preserves the recorded income and legacy payment metadata. */
export function invoiceIssueOutcome(
  load: Pick<Load, "status" | "invoicePaidDate">,
  _invoiceDate: string,
): { status: PaymentStatus; invoicePaidDate: string | null } {
  return { status: load.status, invoicePaidDate: load.invoicePaidDate };
}

/** What issuing an invoice needs, whatever posted it: a web form or a phone. */
export interface InvoiceDetails {
  invoiceNumber: string;
  invoiceDate: string;
  invoiceDueDate?: string | null;
  billToName: string;
  billToEmail?: string | null;
  billToAddress?: string | null;
  invoiceNotes?: string | null;
}

/**
 * An invoice number identifies a document to a customer and to an accountant,
 * so two loads must never carry the same one. The database enforces it with a
 * unique constraint; this catches it first so the owner gets a sentence rather
 * than a constraint violation.
 */
export function duplicateInvoiceNumber(
  loads: Load[],
  loadId: string,
  invoiceNumber: string,
): boolean {
  return loads.some((row) => row.id !== loadId && row.invoiceNumber === invoiceNumber);
}

/**
 * The exact patch issuing an invoice writes onto a load. Empty optional fields
 * become null rather than "". Both callers preserve the load's payment metadata;
 * a document is not another income or collection event.
 */
export function invoiceIssuePatch(
  load: Pick<Load, "status" | "invoicePaidDate"> & Partial<Pick<Load, "invoiceDueDate">>,
  details: InvoiceDetails,
) {
  return {
    ...details,
    invoiceDueDate: details.invoiceDueDate === undefined ? load.invoiceDueDate ?? null : details.invoiceDueDate,
    billToEmail: details.billToEmail || null,
    billToAddress: details.billToAddress || null,
    invoiceNotes: details.invoiceNotes || null,
    ...invoiceIssueOutcome(load, details.invoiceDate),
  };
}

export function nextInvoiceNumber(loads: Load[], date: string): string {
  const year = date.slice(0, 4);
  const prefix = `INV-${year}-`;
  const highest = loads.reduce((max, load) => {
    if (!load.invoiceNumber?.startsWith(prefix)) return max;
    const sequence = Number.parseInt(load.invoiceNumber.slice(prefix.length), 10);
    return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(4, "0")}`;
}

/** Invoice dates describe the document; reported loads have no pending collection. */
export function invoiceAgeDays(_load: Load, _today = new Date()): number | null {
  return null;
}

export function invoiceIsOverdue(load: Load, today = new Date()): boolean {
  return (invoiceAgeDays(load, today) ?? 0) > 0;
}
