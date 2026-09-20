import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { decodeDocumentUploadTicket } from "@/lib/document-upload-ticket";
import { documentUploadRefusal } from "@/lib/document-upload-policy";
import { isSameOriginRequest } from "@/lib/request-origin";
import { getDocumentStorage } from "@/lib/storage";
import {
  chunkKey,
  chunkSize,
  readUploadPart,
} from "@/lib/storage/chunked-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const response = (body: object, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) return response({ error: "Not signed in." }, 401);
  if (!isSameOriginRequest(request))
    return response({ error: "Cross-origin uploads are refused." }, 403);
  const rawTicket = request.headers.get("x-document-upload-ticket");
  const ticket =
    rawTicket && rawTicket.length <= 16_384
      ? await decodeDocumentUploadTicket(rawTicket)
      : null;
  if (
    !ticket ||
    ticket.userId !== session.userId ||
    ticket.businessId !== session.businessId
  )
    return response(
      { error: "The upload authorization is invalid or expired." },
      403,
    );
  const rawPart = request.headers.get("x-document-part");
  if (!rawPart || !/^\d{1,2}$/.test(rawPart))
    return response({ error: "Invalid upload part." }, 400);
  const part = Number(rawPart);
  let expected: number;
  try {
    expected = chunkSize(ticket.sizeBytes, part);
  } catch {
    return response({ error: "Invalid upload part." }, 400);
  }
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) !== expected)
    return response({ error: "Incorrect upload part size." }, 400);
  const dataset = await getRepository(session.businessId).getDataset();
  const refusal = documentUploadRefusal(
    dataset,
    session.role ?? "VIEWER",
    ticket,
  );
  if (refusal) return response({ error: refusal.error }, refusal.status);
  if (
    dataset.documents.some(
      (document) => document.storageKey === ticket.storageKey,
    )
  )
    return response({ error: "The document is already attached." }, 409);
  try {
    const storage = getDocumentStorage();
    if (!storage.chunkedUploads)
      return response({ error: "Chunked uploads are unavailable." }, 409);
    const bytes = await readUploadPart(request, expected);
    await storage.put(
      chunkKey(ticket.storageKey, part),
      bytes,
      "application/octet-stream",
    );
    return response({ ok: true });
  } catch {
    return response({ error: "Could not store the upload part." }, 400);
  }
}
