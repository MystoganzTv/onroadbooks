import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import {
  documentTypeLabel,
  isAcceptedType,
  MAX_FUNCTION_UPLOAD_BYTES,
} from "@/lib/documents";
import { documentUploadRefusal } from "@/lib/document-upload-policy";
import { documentMetaSchema } from "@/lib/schemas";
import { isSameOriginRequest } from "@/lib/request-origin";
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
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin uploads are refused." }, { status: 403 });
  }

  const repository = getRepository(session.businessId);
  const dataset = await repository.getDataset();
  // request.formData() buffers the entire body, so the size guard has to run
  // before it -- checking file.size afterwards is already too late.
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FUNCTION_UPLOAD_BYTES + 64 * 1024) {
    return NextResponse.json(
      { error: "This upload must use direct document storage." },
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
  if (file.size > MAX_FUNCTION_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "This upload must use direct document storage." },
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

  const refusal = documentUploadRefusal(dataset, session.role ?? "VIEWER", {
    owner,
    entityId,
    type,
    label: parsed.data.label,
    fileName: file.name,
    contentType: file.type,
    sizeBytes: file.size,
  });
  if (refusal) {
    return NextResponse.json({ error: refusal.error }, { status: refusal.status });
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
