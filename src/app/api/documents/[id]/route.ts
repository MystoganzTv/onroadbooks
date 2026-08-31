import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { isInlineSafe } from "@/lib/documents";
import { getDocumentStorage } from "@/lib/storage";
import { roleCan, type Permission } from "@/lib/roles";
import { canWrite } from "@/lib/plans";

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

  const download = new URL(request.url).searchParams.get("download") === "1";
  const safeName = document.fileName.replace(/["\\]/g, "_");

  // Only a known-safe rendering type is ever shown inline. Anything else --
  // including a file whose stored type we no longer trust -- is a download,
  // and the sandbox CSP plus nosniff stop the browser second-guessing us.
  const inline = !download && isInlineSafe(document.contentType);
  const storage = getDocumentStorage();

  // Supabase serves the bytes itself through a one-minute signed URL. This
  // keeps both large uploads and large downloads outside Vercel Functions'
  // 4.5 MB request/response envelope.
  if (storage.createSignedDownloadUrl) {
    try {
      const signedUrl = await storage.createSignedDownloadUrl(
        document.storageKey,
        inline ? undefined : safeName,
      );
      return NextResponse.redirect(signedUrl, {
        status: 307,
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch {
      return NextResponse.json({ error: "Could not open the stored document." }, { status: 502 });
    }
  }

  const bytes = await storage.get(document.storageKey);
  if (!bytes) {
    return NextResponse.json({ error: "The stored file is missing." }, { status: 404 });
  }

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
  const repository = getRepository(session.businessId);
  const dataset = await repository.getDataset();
  if (!canWrite(dataset.subscription)) {
    return NextResponse.json(
      { error: "This workspace is read-only until billing is active." },
      { status: 403 },
    );
  }
  const document = dataset.documents.find((row) => row.id === id);
  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
  const permission: Permission = document.loadId
    ? "manage_loads"
    : document.expenseId
      ? "manage_expenses"
      : document.maintenanceId
        ? "manage_maintenance"
        : "manage_fleet";
  if (!roleCan(session.role ?? "VIEWER", permission)) {
    return NextResponse.json({ error: "Your role does not allow removing that document." }, { status: 403 });
  }

  const storageKey = await repository.deleteDocument(id);
  if (!storageKey) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
  await getDocumentStorage().remove(storageKey);
  return NextResponse.json({ ok: true });
}
