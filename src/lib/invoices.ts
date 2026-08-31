import type { Load } from "./types";

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
