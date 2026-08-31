import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { getAuthSecret } from "@/lib/auth/session";
import type { DocumentOwner, DocumentType } from "@/lib/types";

export interface DocumentUploadTicket {
  userId: string;
  businessId: string;
  storageKey: string;
  owner: DocumentOwner;
  entityId: string;
  type: DocumentType;
  label: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  exp: number;
}

function signature(body: string, secret: string): string {
  return createHmac("sha256", secret).update(`document-upload:${body}`).digest("base64url");
}

export async function encodeDocumentUploadTicket(
  payload: Omit<DocumentUploadTicket, "exp">,
): Promise<string> {
  const full: DocumentUploadTicket = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + 15 * 60,
  };
  const body = Buffer.from(JSON.stringify(full), "utf8").toString("base64url");
  return `${body}.${signature(body, await getAuthSecret())}`;
}

export async function decodeDocumentUploadTicket(
  token: string | null | undefined,
): Promise<DocumentUploadTicket | null> {
  if (!token) return null;
  const [body, supplied] = token.split(".");
  if (!body || !supplied) return null;

  const expected = signature(body, await getAuthSecret());
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as DocumentUploadTicket;
    if (
      !payload.userId
      || !payload.businessId
      || !payload.storageKey
      || !payload.entityId
      || !payload.fileName
      || !payload.contentType
      || !(payload.sizeBytes > 0)
      || payload.exp * 1000 < Date.now()
    ) return null;
    return payload;
  } catch {
    return null;
  }
}
