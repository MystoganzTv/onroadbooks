import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import { dataDirectory } from "@/lib/data-directory";
import type { DocumentStorage } from "./contract";
import { SupabaseDocumentStorage } from "./supabase";

/**
 * Document storage.
 *
 * Files live behind this adapter for the same reason rows live behind the
 * repository: the MVP writes to local disk, production will write to
 * Supabase Storage, and no application code should have to change.
 *
 * The Supabase implementation lives in ./supabase.ts and is selected by
 * DOCUMENT_STORAGE=supabase. Nothing above this line changes either way.
 */
export type { DocumentStorage } from "./contract";

/** Resolved per call, for the same reason the ledger path is. */
const uploadDir = () => path.join(dataDirectory(), "uploads");

/** Keys are generated, but never trust one that arrived over the wire. */
function safeKey(key: string): string {
  const normalized = path.normalize(key).replace(/^(\.\.[/\\])+/, "");
  if (normalized.includes("..") || path.isAbsolute(normalized)) {
    throw new Error("Invalid storage key");
  }
  return normalized;
}

export class LocalDocumentStorage implements DocumentStorage {
  async healthcheck(): Promise<void> {
    // A clean checkout has no data directory yet. Local persistence creates
    // it on first use, so readiness should verify that creation succeeds
    // instead of reporting a false failure until the first account is made.
    await fs.mkdir(dataDirectory(), { recursive: true });
    await fs.access(dataDirectory());
  }

  async put(key: string, data: Buffer, _contentType: string): Promise<string> {
    const target = path.join(uploadDir(), safeKey(key));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);
    return key;
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(path.join(uploadDir(), safeKey(key)));
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await fs.unlink(path.join(uploadDir(), safeKey(key)));
    } catch {
      // Already gone -- deleting the row is what matters.
    }
  }
}

let storage: DocumentStorage | null = null;

/**
 * DOCUMENT_STORAGE=supabase switches to object storage; anything else keeps
 * files on local disk. A half-configured Supabase falls back rather than
 * failing every upload, and says so once in the log.
 */
export function getDocumentStorage(): DocumentStorage {
  if (storage) return storage;

  if (process.env.DOCUMENT_STORAGE === "supabase") {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "documents";

    if (url && key) {
      storage = new SupabaseDocumentStorage(url, key, bucket);
      return storage;
    }
    console.warn(
      "[storage] DOCUMENT_STORAGE=supabase but SUPABASE_URL / SUPABASE_SECRET_KEY are not set. Falling back to local disk.",
    );
  }

  storage = new LocalDocumentStorage();
  return storage;
}

export function storageBackend(): "supabase" | "local" {
  return getDocumentStorage() instanceof LocalDocumentStorage ? "local" : "supabase";
}

/** Storage keys are namespaced by owner so the bucket stays browsable. */
export function buildStorageKey(owner: string, entityId: string, fileName: string): string {
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${owner.toLowerCase()}/${entityId}/${stamp}${random}-${safeName}`;
}
