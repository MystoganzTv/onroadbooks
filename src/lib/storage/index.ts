import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Document storage.
 *
 * Files live behind this adapter for the same reason rows live behind the
 * repository: the MVP writes to local disk, production will write to
 * Supabase Storage, and no application code should have to change.
 *
 * A Supabase implementation is a drop-in:
 *
 *   class SupabaseDocumentStorage implements DocumentStorage {
 *     async put(key, data, contentType) {
 *       await supabase.storage.from("documents")
 *         .upload(key, data, { contentType, upsert: true });
 *       return key;
 *     }
 *     async get(key) {
 *       const { data } = await supabase.storage.from("documents").download(key);
 *       return data ? Buffer.from(await data.arrayBuffer()) : null;
 *     }
 *     async remove(key) {
 *       await supabase.storage.from("documents").remove([key]);
 *     }
 *   }
 *
 * Swap it in `getDocumentStorage()` and everything above keeps working.
 */
export interface DocumentStorage {
  /** Persists bytes and returns the key needed to read them back. */
  put(key: string, data: Buffer, contentType: string): Promise<string>;
  get(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

/** Keys are generated, but never trust one that arrived over the wire. */
function safeKey(key: string): string {
  const normalized = path.normalize(key).replace(/^(\.\.[/\\])+/, "");
  if (normalized.includes("..") || path.isAbsolute(normalized)) {
    throw new Error("Invalid storage key");
  }
  return normalized;
}

export class LocalDocumentStorage implements DocumentStorage {
  async put(key: string, data: Buffer, _contentType: string): Promise<string> {
    const target = path.join(UPLOAD_DIR, safeKey(key));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);
    return key;
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(path.join(UPLOAD_DIR, safeKey(key)));
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await fs.unlink(path.join(UPLOAD_DIR, safeKey(key)));
    } catch {
      // Already gone -- deleting the row is what matters.
    }
  }
}

let storage: DocumentStorage | null = null;

export function getDocumentStorage(): DocumentStorage {
  if (!storage) storage = new LocalDocumentStorage();
  return storage;
}

/** Storage keys are namespaced by owner so the bucket stays browsable. */
export function buildStorageKey(owner: string, entityId: string, fileName: string): string {
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
  const stamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${owner.toLowerCase()}/${entityId}/${stamp}${random}-${safeName}`;
}
