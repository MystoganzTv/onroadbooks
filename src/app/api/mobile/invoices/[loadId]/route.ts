import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { fieldErrorsFrom } from "@/lib/actions/types";
import { requireMobileWrite } from "@/lib/auth/mobile";
import { duplicateInvoiceNumber, invoiceIssuePatch } from "@/lib/invoices";
import { invoiceSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Invoice documents are optional; recording a load already records income. */
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

  if (body.intent === "paid" || body.intent === "payment") {
    return NextResponse.json(
      { error: "Income is already recorded with the load. A separate payment is not needed." },
      { status: 409 },
    );
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
