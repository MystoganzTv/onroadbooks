import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { S3Client } from "@aws-sdk/client-s3";
import { R2DocumentStorage, r2Configuration } from "./r2";

import { dataDirectory } from "@/lib/data-directory";
import type { DocumentStorage } from "./contract";

/** Private R2 storage in production, with disk storage for local development. */
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

/** Explicit R2 selection fails closed if its credentials are incomplete. */
export function getDocumentStorage(): DocumentStorage {
  if (storage) return storage;

  if (process.env.DOCUMENT_STORAGE === "r2") {
    const config = r2Configuration(process.env);
    storage = new R2DocumentStorage(new S3Client(config.client), config.bucket);
    return storage;
  }

  if (process.env.DOCUMENT_STORAGE && process.env.DOCUMENT_STORAGE !== "local")
    throw new Error("Unsupported document storage backend; choose r2 or local.");

  storage = new LocalDocumentStorage();
  return storage;
}

export function storageBackend(): "r2" | "local" {
  return getDocumentStorage() instanceof R2DocumentStorage ? "r2" : "local";
}

/** Storage keys are namespaced by owner so the bucket stays browsable. */
export function buildStorageKey(
  owner: string,
  entityId: string,
  fileName: string,
): string {
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
  const stamp = Date.now().toString(36);
  const random = randomUUID();
  return `${owner.toLowerCase()}/${entityId}/${stamp}${random}-${safeName}`;
}
