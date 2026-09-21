import { NextResponse, type NextRequest } from "next/server";

import { getMobileSession } from "@/lib/auth/mobile";
import { getRepository } from "@/lib/db";
import { invoiceAgeDays, invoicePaymentSummary, nextInvoiceNumber } from "@/lib/invoices";
import { todayISO } from "@/lib/periods";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Optional invoice documents, with settled balances for older mobile clients. */
export async function GET(request: NextRequest) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dataset = await getRepository(session.businessId).getDataset();
  const today = todayISO();

  const loads = [...dataset.loads].sort((a, b) =>
    (b.invoiceDate ?? b.date).localeCompare(a.invoiceDate ?? a.date),
  );

  const rows = loads.map((load) => {
    const payment = invoicePaymentSummary(load, dataset.paymentEvents);
    return ({
    loadId: load.id,
    invoiceNumber: load.invoiceNumber ?? null,
    loadNumber: load.loadNumber ?? null,
    customer: load.billToName ?? load.broker ?? null,
    lane: `${load.originCity}, ${load.originState} → ${load.destinationCity}, ${load.destinationState}`,
    amount: load.grossRate,
    status: "PAID",
    date: load.date,
    invoiceDate: load.invoiceDate ?? null,
    invoiceDueDate: load.invoiceDueDate ?? null,
    invoicePaidDate: load.date,
    // Positive means late by that many days; null when there is nothing to be
    // late for. The web page computes overdue from exactly this.
    overdueDays: invoiceAgeDays(load),
    collectedAmount: payment.collected,
    balanceAmount: payment.balance,
    paymentEventCount: payment.eventCount,
  });
  });

  const outstanding = loads.filter(
    (load) => invoicePaymentSummary(load, dataset.paymentEvents).balance > 0,
  );
  const overdue = outstanding.filter((load) => (invoiceAgeDays(load) ?? 0) > 0);
  const outstandingTotal = (list: typeof loads) => list.reduce(
    (sum, load) => sum + invoicePaymentSummary(load, dataset.paymentEvents).balance,
    0,
  );

  return NextResponse.json(
    {
      today,
      suggestedNumber: nextInvoiceNumber(loads, today),
      summary: {
        outstandingAmount: outstandingTotal(outstanding),
        outstandingCount: outstanding.length,
        overdueAmount: outstandingTotal(overdue),
        overdueCount: overdue.length,
        collectedAmount: loads.reduce(
          (sum, load) => sum + invoicePaymentSummary(load, dataset.paymentEvents).collected,
          0,
        ),
        collectedCount: loads.filter(
          (load) => invoicePaymentSummary(load, dataset.paymentEvents).collected > 0,
        ).length,
        uninvoicedCount: loads.filter((load) => !load.invoiceNumber).length,
      },
      invoices: rows,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
