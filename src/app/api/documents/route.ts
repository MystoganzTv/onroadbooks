import { NextResponse } from "next/server";

import { getRepository } from "@/lib/db";
import {
  documentTypeLabel,
  isAcceptedType,
  MAX_DOCUMENT_BYTES,
} from "@/lib/documents";
import { documentMetaSchema } from "@/lib/schemas";
import { buildStorageKey, getDocumentStorage } from "@/lib/storage";
import type { DocumentOwner, DocumentType } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Uploads one document and files it against a load, expense, truck or
 * maintenance record. The bytes go to the storage adapter (local disk now,
 * Supabase Storage later) and only the metadata lands in the database.
 */
/**
 * Route handlers get none of the Origin checking Next.js applies to server
 * actions, and a multipart POST is a CORS "simple request" -- so any site
 * could otherwise make a visitor's browser upload here.
 */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Same-origin navigations and curl send none.
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin uploads are refused." }, { status: 403 });
  }

  // request.formData() buffers the entire body, so the size guard has to run
  // before it -- checking file.size afterwards is already too late.
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_DOCUMENT_BYTES + 64 * 1024) {
    return NextResponse.json(
      { error: `Files must be ${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))} MB or smaller.` },
      { status: 413 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was included." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return NextResponse.json(
      { error: `Files must be ${Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))} MB or smaller.` },
      { status: 413 },
    );
  }
  if (!isAcceptedType(file.type)) {
    return NextResponse.json(
      { error: "Only images and PDFs can be attached." },
      { status: 415 },
    );
  }

  const parsed = documentMetaSchema.safeParse({
    type: form.get("type"),
    label: form.get("label"),
    owner: form.get("owner"),
    entityId: form.get("entityId"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing or invalid document details." }, { status: 400 });
  }

  const { owner, entityId, type } = parsed.data as {
    owner: DocumentOwner;
    entityId: string;
    type: DocumentType;
  };

  const repository = getRepository();
  const dataset = await repository.getDataset();

  // Never let an upload create an orphan pointing at a record that is gone.
  const ownerExists =
    owner === "LOAD"
      ? dataset.loads.some((l) => l.id === entityId)
      : owner === "EXPENSE"
        ? dataset.expenses.some((e) => e.id === entityId)
        : owner === "MAINTENANCE"
          ? dataset.maintenanceRecords.some((m) => m.id === entityId)
          : dataset.truck.id === entityId;

  if (!ownerExists) {
    return NextResponse.json({ error: "That record no longer exists." }, { status: 404 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const key = buildStorageKey(owner, entityId, file.name);

  try {
    await getDocumentStorage().put(key, bytes, file.type);
  } catch {
    return NextResponse.json({ error: "Could not store the file." }, { status: 500 });
  }

  const document = await repository.createDocument({
    type,
    label: (parsed.data.label || "").trim() || file.name || documentTypeLabel(type),
    fileName: file.name || `${type.toLowerCase()}.bin`,
    contentType: file.type || "application/octet-stream",
    sizeBytes: bytes.byteLength,
    storageKey: key,
    loadId: owner === "LOAD" ? entityId : null,
    expenseId: owner === "EXPENSE" ? entityId : null,
    truckId: owner === "TRUCK" ? entityId : null,
    maintenanceId: owner === "MAINTENANCE" ? entityId : null,
  });

  return NextResponse.json({ document }, { status: 201 });
}
