import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { encodeDocumentUploadTicket } from "@/lib/document-upload-ticket";
import {
  documentUploadMetadataSchema,
  documentUploadRefusal,
} from "@/lib/document-upload-policy";
import { isSameOriginRequest } from "@/lib/request-origin";
import { buildStorageKey, getDocumentStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return response({ error: "Not signed in." }, 401);
  if (!isSameOriginRequest(request)) return response({ error: "Cross-origin uploads are refused." }, 403);

  const parsed = documentUploadMetadataSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response({ error: "Missing or invalid document details." }, 400);

  const dataset = await getRepository(session.businessId).getDataset();
  const refusal = documentUploadRefusal(dataset, session.role ?? "VIEWER", parsed.data);
  if (refusal) return response({ error: refusal.error }, refusal.status);

  const storage = getDocumentStorage();
  if (!storage.createSignedUpload) {
    return response({ strategy: "multipart" });
  }

  try {
    const storageKey = buildStorageKey(parsed.data.owner, parsed.data.entityId, parsed.data.fileName);
    const upload = await storage.createSignedUpload(storageKey);
    const ticket = await encodeDocumentUploadTicket({
      userId: session.userId,
      businessId: session.businessId,
      storageKey,
      owner: parsed.data.owner,
      entityId: parsed.data.entityId,
      type: parsed.data.type,
      label: parsed.data.label?.trim() || parsed.data.fileName,
      fileName: parsed.data.fileName,
      contentType: parsed.data.contentType,
      sizeBytes: parsed.data.sizeBytes,
    });
    return response({ strategy: "direct", upload, ticket });
  } catch {
    return response({ error: "Could not prepare secure document storage." }, 500);
  }
}
