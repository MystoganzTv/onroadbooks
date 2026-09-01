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
  const collected = legacyPaid
    ? load.grossRate
    : roundMoney(events.reduce((total, event) => total + event.amount, 0));
  return {
    collected,
    balance: Math.max(0, roundMoney(load.grossRate - collected)),
    eventCount: events.length,
    legacyPaid,
  };
}

/**
 * What issuing an invoice does to a load's status and payment date.
 *
 * A load that is already PAID stays paid. Owner-operators are routinely
 * quick-paid or factored before the paperwork is cut, so attaching the
 * document to money already collected must not turn it back into a
 * receivable -- doing so drops the load out of "Collected" and into
 * "Outstanding", and the owner is left chasing an invoice that is settled.
 *
 * Anything else becomes INVOICED with no payment date: that is the whole
 * point of issuing it.
 */
export function invoiceIssueOutcome(
  load: Pick<Load, "status" | "invoicePaidDate">,
  invoiceDate: string,
): { status: PaymentStatus; invoicePaidDate: string | null } {
  if (load.status !== "PAID") return { status: "INVOICED", invoicePaidDate: null };
  // Paid before it was ever invoiced: the invoice date is the closest honest
  // stand-in, and leaving it null would strand the load without one.
  return { status: "PAID", invoicePaidDate: load.invoicePaidDate ?? invoiceDate };
}

/** What issuing an invoice needs, whatever posted it: a web form or a phone. */
export interface InvoiceDetails {
  invoiceNumber: string;
  invoiceDate: string;
  invoiceDueDate: string;
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
 * become null rather than "", and `invoiceIssueOutcome` decides the status --
 * both callers go through here so a phone can never write a shape the web form
 * would not have written.
 */
export function invoiceIssuePatch(
  load: Pick<Load, "status" | "invoicePaidDate">,
  details: InvoiceDetails,
) {
  return {
    ...details,
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

export function invoiceAgeDays(load: Load, today = new Date()): number | null {
  if (!load.invoiceDueDate || load.status === "PAID") return null;
  const due = new Date(`${load.invoiceDueDate}T00:00:00Z`);
  const current = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.floor((current - due.getTime()) / 86_400_000);
}

export function invoiceIsOverdue(load: Load, today = new Date()): boolean {
  return (invoiceAgeDays(load, today) ?? 0) > 0;
}
