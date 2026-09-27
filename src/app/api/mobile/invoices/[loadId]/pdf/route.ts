import { NextResponse } from "next/server";
import { getMobileSession } from "@/lib/auth/mobile";
import { getRepository } from "@/lib/db";
import { invoicePdf } from "@/lib/export-pdf";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ loadId: string }> }) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dataset = await getRepository(session.businessId).getDataset();
  const { loadId } = await params;
  const load = dataset.loads.find(row => row.id === loadId);
  if (!load?.invoiceNumber) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  const name = load.invoiceNumber.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  return new NextResponse(Buffer.from(await invoicePdf(dataset.business, load)), { headers: {
    "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}.pdf"`, "Cache-Control": "private, no-store",
  } });
}
