import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { fieldErrorsFrom } from "@/lib/actions/types";
import { requireMobileWrite } from "@/lib/auth/mobile";
import { duplicateInvoiceNumber, invoiceIssuePatch, invoicePaymentSummary } from "@/lib/invoices";
import { invoiceSchema, paymentEventSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The two things worth doing to an invoice away from a desk: cut it, and mark
 * it collected. Both mirror the server actions in `lib/actions/invoices.ts`
 * exactly -- same `invoiceSchema`, same duplicate-number rule, same
 * `invoiceIssuePatch`, same `manage_finances` permission.
 *
 * `intent` picks which, because these are two writes to the same record rather
 * than two resources.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ loadId: string }> },
) {
  const gate = await requireMobileWrite(request, "manage_finances");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { loadId } = await params;

  let body: { intent?: string; paidOn?: string; [key: string]: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const dataset = await gate.repository.getDataset();
  const load = dataset.loads.find((row) => row.id === loadId);
  if (!load) return NextResponse.json({ error: "Load not found." }, { status: 404 });

  const done = () => {
    for (const path of ["/invoices", "/loads", `/loads/${loadId}`, "/reports", "/dashboard"]) {
      revalidatePath(path);
    }
    return NextResponse.json({ id: loadId });
  };

  if (body.intent === "paid") {
    if (!load.invoiceNumber) {
      return NextResponse.json(
        { error: "Issue the invoice before marking it paid." },
        { status: 422 },
      );
    }
    const paidOn = typeof body.paidOn === "string" ? body.paidOn : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
      return NextResponse.json({ error: "Use a valid payment date." }, { status: 422 });
    }
    try {
      // `invoicePaymentSummary` is the one reader of what is still owed --
      // the same one the web action and the invoice screen use. Its arithmetic
      // also knows about a load marked PAID before payment events existed,
      // which is what stops this from posting the whole rate a second time.
      const { balance } = invoicePaymentSummary(load, dataset.paymentEvents);
      if (balance <= 0) {
        return NextResponse.json({ error: "That invoice is already fully paid." }, { status: 422 });
      }
      await gate.repository.createPaymentEvent({ loadId, date: paidOn, amount: balance });
      return done();
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not mark it paid." },
        { status: 400 },
      );
    }
  }

  if (body.intent === "payment") {
    const parsed = paymentEventSchema.safeParse({ ...body, loadId });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Check the payment.", fieldErrors: fieldErrorsFrom(parsed.error.issues) },
        { status: 422 },
      );
    }
    try {
      await gate.repository.createPaymentEvent(parsed.data);
      return done();
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not record payment." },
        { status: 400 },
      );
    }
  }

  if (body.intent === "issue") {
    const parsed = invoiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error.issues) },
        { status: 422 },
      );
    }
    if (duplicateInvoiceNumber(dataset.loads, loadId, parsed.data.invoiceNumber)) {
      return NextResponse.json(
        {
          error: "That invoice number is already in use.",
          fieldErrors: { invoiceNumber: "Use a unique invoice number" },
        },
        { status: 422 },
      );
    }
    try {
      await gate.repository.updateLoad(loadId, { ...load, ...invoiceIssuePatch(load, parsed.data) });
      return done();
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not issue the invoice." },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({ error: "Unknown intent." }, { status: 400 });
}
