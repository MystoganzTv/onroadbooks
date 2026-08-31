import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { invoicePdf } from "@/lib/export-pdf";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const dataset = await getRepository(session.businessId).getDataset();
  const { id } = await params;
  const load = dataset.loads.find((row) => row.id === id);
  if (!load?.invoiceNumber) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  const bytes = await invoicePdf(dataset.business, load);
  const name = load.invoiceNumber.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  return new NextResponse(Buffer.from(bytes), { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${name}.pdf"`,
    "Cache-Control": "private, no-store",
  } });
}
