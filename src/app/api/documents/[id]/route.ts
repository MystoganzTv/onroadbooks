import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { isInlineSafe } from "@/lib/documents";
import { getDocumentStorage } from "@/lib/storage";

export const runtime = "nodejs";

/** Streams a stored document back. `?download=1` forces a save dialog. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  const dataset = await getRepository(session.businessId).getDataset();
  const document = dataset.documents.find((d) => d.id === id);
  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const bytes = await getDocumentStorage().get(document.storageKey);
  if (!bytes) {
    return NextResponse.json({ error: "The stored file is missing." }, { status: 404 });
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const safeName = document.fileName.replace(/["\\]/g, "_");

  // Only a known-safe rendering type is ever shown inline. Anything else --
  // including a file whose stored type we no longer trust -- is a download,
  // and the sandbox CSP plus nosniff stop the browser second-guessing us.
  const inline = !download && isInlineSafe(document.contentType);

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": inline ? document.contentType : "application/octet-stream",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"`,
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=0, must-revalidate",
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  const storageKey = await getRepository(session.businessId).deleteDocument(id);
  if (!storageKey) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
  await getDocumentStorage().remove(storageKey);
  return NextResponse.json({ ok: true });
}
