import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { getRepository } from "@/lib/db";
import { decodeDocumentUploadTicket } from "@/lib/document-upload-ticket";
import { documentUploadRefusal } from "@/lib/document-upload-policy";
import { isAcceptedType } from "@/lib/documents";
import { getDocumentStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const completionSchema = z.object({ ticket: z.string().min(20).max(16_384) }).strict();

function response(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return response({ error: "Not signed in." }, 401);
  if (!sameOrigin(request)) return response({ error: "Cross-origin uploads are refused." }, 403);

  const parsed = completionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response({ error: "The upload confirmation is invalid." }, 400);

  const ticket = await decodeDocumentUploadTicket(parsed.data.ticket);
  if (
    !ticket
    || ticket.userId !== session.userId
    || ticket.businessId !== session.businessId
  ) {
    return response({ error: "The upload authorization is invalid or expired." }, 403);
  }

  const repository = getRepository(session.businessId);
  const dataset = await repository.getDataset();
  const existing = dataset.documents.find((document) => document.storageKey === ticket.storageKey);
  if (existing) return response({ document: existing });

  const refusal = documentUploadRefusal(dataset, session.role ?? "VIEWER", ticket);
  if (refusal) return response({ error: refusal.error }, refusal.status);

  const storage = getDocumentStorage();
  if (!storage.info) return response({ error: "Direct document storage is unavailable." }, 409);

  try {
    const stored = await storage.info(ticket.storageKey);
    if (!stored) return response({ error: "The uploaded document was not found." }, 404);
    if (
      stored.sizeBytes !== ticket.sizeBytes
      || (stored.contentType && !isAcceptedType(stored.contentType))
    ) {
      await storage.remove(ticket.storageKey);
      return response({ error: "The stored document did not match the authorized upload." }, 400);
    }

    const document = await repository.createDocument({
      type: ticket.type,
      label: ticket.label,
      fileName: ticket.fileName,
      contentType: ticket.contentType,
      sizeBytes: ticket.sizeBytes,
      storageKey: ticket.storageKey,
      loadId: ticket.owner === "LOAD" ? ticket.entityId : null,
      expenseId: ticket.owner === "EXPENSE" ? ticket.entityId : null,
      truckId: ticket.owner === "TRUCK" ? ticket.entityId : null,
      maintenanceId: ticket.owner === "MAINTENANCE" ? ticket.entityId : null,
    });
    return response({ document }, 201);
  } catch {
    return response({ error: "Could not finish attaching the document." }, 500);
  }
}
