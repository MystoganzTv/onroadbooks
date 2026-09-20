import "server-only";
import { MAX_DOCUMENT_BYTES } from "../documents";
import type { DocumentUploadTicket } from "../document-upload-ticket";
import type { DocumentStorage } from "./contract";

// Under Vercel's request ceiling, including headers. Never expose an R2 write URL.
export const DOCUMENT_CHUNK_BYTES = 2 * 1024 * 1024;
type Upload = Pick<
  DocumentUploadTicket,
  "storageKey" | "sizeBytes" | "contentType"
>;
export function chunkSize(total: number, part: number) {
  if (
    !Number.isInteger(total) ||
    total <= 0 ||
    total > MAX_DOCUMENT_BYTES ||
    !Number.isInteger(part) ||
    part < 0 ||
    part >= Math.ceil(total / DOCUMENT_CHUNK_BYTES)
  ) {
    throw new Error("Invalid upload part.");
  }
  return Math.min(DOCUMENT_CHUNK_BYTES, total - part * DOCUMENT_CHUNK_BYTES);
}
export function chunkKey(key: string, part: number) {
  return `_pending/${key}/part-${part}`;
}

/** Stops reading untrusted bodies at the signed size, including chunked HTTP requests. */
export async function readUploadPart(request: Request, expectedSize: number) {
  if (!request.body) throw new Error("Missing upload body.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > expectedSize)
        throw new Error("Upload part exceeds its authorized size.");
      chunks.push(result.value);
    }
    if (size !== expectedSize) throw new Error("Incomplete upload part.");
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function finishChunkedUpload(
  storage: DocumentStorage,
  upload: Upload,
) {
  chunkSize(upload.sizeBytes, 0);
  if (!storage.chunkedUploads || !storage.info)
    throw new Error("Chunked uploads are unavailable.");
  const existing = await storage.info(upload.storageKey);
  if (existing) {
    if (
      existing.sizeBytes !== upload.sizeBytes ||
      existing.contentType !== upload.contentType
    )
      throw new Error("Stored document differs from upload authorization.");
    return; // Retry after a completed write or a failed metadata transaction.
  }
  const count = Math.ceil(upload.sizeBytes / DOCUMENT_CHUNK_BYTES);
  const parts: Buffer[] = [];
  for (let part = 0; part < count; part++) {
    const bytes = await storage.get(chunkKey(upload.storageKey, part));
    if (!bytes || bytes.length !== chunkSize(upload.sizeBytes, part))
      throw new Error("An upload part is missing or incomplete.");
    parts.push(bytes);
  }
  await storage.put(
    upload.storageKey,
    Buffer.concat(parts),
    upload.contentType,
  );
  // A failed cleanup must not undo a completed immutable upload. Bucket lifecycle
  // expires abandoned _pending/ objects after one day (required at provisioning).
  await Promise.allSettled(
    parts.map((_, part) => storage.remove(chunkKey(upload.storageKey, part))),
  );
}
