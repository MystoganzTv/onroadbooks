import type { Load, PaymentStatus } from "./types";

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
