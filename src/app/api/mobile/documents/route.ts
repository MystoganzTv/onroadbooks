import { NextResponse, type NextRequest } from "next/server";

import { getMobileSession } from "@/lib/auth/mobile";
import { getRepository } from "@/lib/db";
import { documentUploadRefusal } from "@/lib/document-upload-policy";
import {
  documentTypeLabel,
  isAcceptedType,
  MAX_FUNCTION_UPLOAD_BYTES,
} from "@/lib/documents";
import { buildStorageKey, getDocumentStorage } from "@/lib/storage";
import type { DocumentOwner, DocumentType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OWNERS: DocumentOwner[] = ["LOAD", "EXPENSE", "TRUCK", "MAINTENANCE"];

/**
 * A photo of a receipt, filed against the record it belongs to.
 *
 * The bytes go to the same storage adapter and the metadata to the same
 * `createDocument` the web upload uses, gated by the same
 * `documentUploadRefusal` -- which is where the subscription check, the role
 * check for THIS kind of owner, and "does that record still exist" all live.
 *
 * Two differences from `/api/documents`, both because this is a phone and not
 * a browser: the caller proves itself with a bearer token, and there is no
 * same-origin check -- that one exists because a browser attaches cookies to
 * cross-site form posts by itself, which is not a thing that can happen here.
 */
export async function POST(request: NextRequest) {
  const session = await getMobileSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // formData() buffers the whole body, so the size guard runs before it --
  // checking file.size afterwards is already too late.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_FUNCTION_UPLOAD_BYTES + 64 * 1024) {
    return NextResponse.json(
      { error: "Esa foto es muy grande. Vuelve a tomarla." },
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
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No se incluyó ninguna foto." }, { status: 400 });
  }
  if (file.size > MAX_FUNCTION_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "Esa foto es muy grande. Vuelve a tomarla." },
      { status: 413 },
    );
  }
  if (!isAcceptedType(file.type)) {
    return NextResponse.json({ error: "Solo se pueden adjuntar imágenes y PDFs." }, { status: 415 });
  }

  const owner = String(form.get("owner") ?? "") as DocumentOwner;
  const entityId = String(form.get("entityId") ?? "");
  const type = String(form.get("type") ?? "RECEIPT") as DocumentType;
  if (!OWNERS.includes(owner) || !entityId) {
    return NextResponse.json({ error: "Missing document details." }, { status: 400 });
  }

  const repository = getRepository(session.businessId);
  const dataset = await repository.getDataset();
  const fileName = file.name || "recibo.jpg";

  const refusal = documentUploadRefusal(dataset, session.role ?? "VIEWER", {
    owner,
    entityId,
    type,
    label: null,
    fileName,
    contentType: file.type,
    sizeBytes: file.size,
  });
  if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });

  const bytes = Buffer.from(await file.arrayBuffer());
  const key = buildStorageKey(owner, entityId, fileName);

  try {
    await getDocumentStorage().put(key, bytes, file.type);
  } catch {
    return NextResponse.json({ error: "No se pudo guardar la foto." }, { status: 500 });
  }

  const document = await repository.createDocument({
    type,
    label: documentTypeLabel(type),
    fileName,
    contentType: file.type || "image/jpeg",
    sizeBytes: bytes.byteLength,
    storageKey: key,
    loadId: owner === "LOAD" ? entityId : null,
    expenseId: owner === "EXPENSE" ? entityId : null,
    truckId: owner === "TRUCK" ? entityId : null,
    maintenanceId: owner === "MAINTENANCE" ? entityId : null,
  });

  return NextResponse.json({ id: document.id }, { status: 201 });
}
